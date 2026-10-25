/**
 * verify-release —— 发布前终验（bun run verify:release；本地 release 脚本与流水线 prepare 环同入口）
 *
 * 在拿到 OIDC token 之前，把「这次要发的是什么」摊开并机器校验，供 environment
 * 审批时核对。四项：
 *   1. 发布件清单：npm pack --dry-run 的产物必须含 lib 双产物、readme/LICENSE/
 *      package.json，且不得混入 src/（files 清单纪律，Koishi loader 只认 lib CJS）；
 *   2. files 清单只含 lib（多一项就多一分发布面，发展了记得回来改这里的口径）；
 *   3. peerDependencies.koishi 存在（Koishi 市场契约：插件以 peer 单实例接入宿主）；
 *   4. publishConfig.access = public（scoped 包发布面声明，漏了会被 registry 拒）。
 *
 * 移植自 KuroProtocol scripts/verify-release.ts，按本仓形态（单包、无金样本目录、
 * 无版本史）瘦身为发布件面检查。
 *
 * 依赖 dist 先行：必须在 `bun run build` 之后跑（release 脚本里 gate 已含 build）。
 * 零 npm 依赖（仅 node: 内建 + npm CLI）；仓根由 import.meta.url 推导，不依赖 cwd。
 * Windows 上 npm 是 .cmd，经 ComSpec 显式执行。
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[verify:release]";
/** 发布件必须含的路径（npm 对 readme/LICENSE/package.json 恒包含，此处显式锚定）。 */
const REQUIRED_PACK_FILES = [
    "package.json",
    "readme.md",
    "LICENSE",
    "lib/index.cjs",
    "lib/index.d.ts",
] as const;

interface PackageManifest {
    readonly name: string;
    readonly version: string;
    readonly files: readonly unknown;
    readonly peerDependencies: unknown;
    readonly publishConfig: unknown;
}

interface PackedFile {
    readonly path: string;
}

interface PackInfo {
    readonly entryCount?: number;
    readonly size?: number;
    readonly unpackedSize?: number;
    readonly files: readonly PackedFile[];
}

function fail(detail: string): never {
    console.log(`${TAG} 失败：${detail}`);
    process.exit(1);
}

/** 读取并粗校 package.json（发布件身份与契约字段）。 */
function readPackageManifest(): PackageManifest {
    let raw: string;
    try {
        raw = readFileSync(join(REPO_ROOT, "package.json"), "utf8");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail(`无法读取 package.json：${message}（脚本应位于 <root>/scripts/ 下）`);
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
        fail("package.json 不是对象");
    }
    const record = parsed as Record<string, unknown>;
    const name = record["name"];
    const version = record["version"];
    if (typeof name !== "string" || name === "") {
        fail("package.json 缺少 name");
    }
    if (typeof version !== "string" || version === "") {
        fail("package.json 缺少 version");
    }
    return {
        name,
        version,
        files: Array.isArray(record["files"]) ? record["files"] : [],
        peerDependencies: record["peerDependencies"],
        publishConfig: record["publishConfig"],
    };
}

/** 运行 npm pack --dry-run --json（不发布、不执行仓库生命周期脚本，仅算发布件清单）。 */
function runNpmPack(): PackInfo {
    const isWindows = process.platform === "win32";
    const command = isWindows ? (process.env["ComSpec"] ?? "cmd.exe") : "npm";
    const args = isWindows
        ? ["/d", "/s", "/c", "npm", "pack", "--dry-run", "--json"]
        : ["pack", "--dry-run", "--json"];
    const result = spawnSync(command, args, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error !== undefined) {
        fail(`无法启动 npm：${result.error.message}`);
    }
    if (result.status !== 0) {
        const detail = (result.stderr ?? "").trim() || `退出码 ${result.status}`;
        fail(`npm pack --dry-run 失败：${detail}`);
    }
    const parsed: unknown = JSON.parse(result.stdout);
    if (!Array.isArray(parsed) || parsed.length === 0) {
        fail("npm pack --dry-run --json 输出为空");
    }
    const info: unknown = parsed[0];
    const files =
        typeof info === "object" && info !== null ? (info as { files?: unknown }).files : undefined;
    if (!Array.isArray(files)) {
        fail("npm pack --dry-run --json 输出缺少 files 清单");
    }
    return info as PackInfo;
}

/** 人类可读体积（kB / MB）。 */
function formatSize(bytes: number): string {
    return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${(bytes / 1024).toFixed(1)} kB`;
}

function main(): void {
    const manifest = readPackageManifest();

    // 第 1 项：发布件清单。
    const info = runNpmPack();
    const paths = new Set(info.files.map((file) => file.path));
    const missing = REQUIRED_PACK_FILES.filter((path) => !paths.has(path));
    if (missing.length > 0) {
        fail(
            `发布件缺少必需文件：${missing.join("、")}` +
                "（检查 package.json 的 files 清单，以及构建是否在 verify:release 之前完成）",
        );
    }
    const leaked = [...paths].filter((path) => path.startsWith("src/"));
    if (leaked.length > 0) {
        fail(`发布件混入 src/：${leaked.join("、")}（files 清单应只含 lib）`);
    }
    console.log(
        `${TAG} 发布件：${info.entryCount ?? paths.size} 个文件，` +
            `打包 ${formatSize(info.size ?? 0)}，解包 ${formatSize(info.unpackedSize ?? 0)}`,
    );

    // 第 2 项：files 清单纪律。
    const files = manifest.files.filter((entry): entry is string => typeof entry === "string");
    if (files.length !== 1 || files[0] !== "lib") {
        fail(`package.json 的 files 清单应为 ["lib"]，实际 ${JSON.stringify(files)}`);
    }

    // 第 3 项：Koishi 市场契约。
    if (
        typeof manifest.peerDependencies !== "object" ||
        manifest.peerDependencies === null ||
        !("koishi" in manifest.peerDependencies)
    ) {
        fail("peerDependencies 缺少 koishi（Koishi 插件以 peer 单实例接入宿主）");
    }

    // 第 4 项：发布面声明。
    if (
        typeof manifest.publishConfig !== "object" ||
        manifest.publishConfig === null ||
        (manifest.publishConfig as { access?: unknown }).access !== "public"
    ) {
        fail('publishConfig.access 应为 "public"');
    }

    console.log(`${TAG} 通过：${manifest.name}@${manifest.version} 的发布件与契约字段一致`);
}

main();
