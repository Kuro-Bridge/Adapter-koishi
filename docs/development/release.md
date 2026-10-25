# 发布手册（OIDC 可信发布）

> **铁律：一切发布走 `.github/workflows/release.yml`，禁止本地 `npm publish`。** 推送到
> main 的提交若携带一个尚未上架的 `package.json` 版本，流水线会跑门禁、构建、发布件
> 终验，停在 `release` environment 审批；批准后由 npm 可信发布（OIDC）上架，并自动打
> `v<version>` tag。仓库不持有任何 npm 长期 token，也没有 npm secret。

流水线移植自 KuroProtocol（`docs/guides/release.md`，0.4.1 实战验证），结构性设计
原样保留；差异只有包管理器（Bun）与终验口径（本仓无金样本目录 / 版本史，终验是
发布件面检查，见 `scripts/verify-release.ts`）。

## 1. 流水线形态

| job | 职责 | 权限 |
|---|---|---|
| `prepare` | 检测版本是否已上架 → `bun run gate` → `bun run verify:release` → 打包 artifact | `contents: read`；**无** `id-token` |
| `publish` | 解包 artifact → `node scripts/verify-trust.ts` → `npm publish` | `id-token: write` + `environment: release` 审批；**无** contents 写权限 |
| `tag` | 建 `v<version>` 注释 tag 并推送 | `contents: write`；**无** `id-token` |

三条结构性约束：

- **构建期代码与 OIDC token 分处两个 job**：`package.json` 脚本、tsdown 配置、依赖
  postinstall 都是构建期执行的代码，不能和发布 token 同处。`publish` 不安装依赖、
  不构建，只解包、预检、`npm publish --ignore-scripts`。
- **先门禁与终验、后审批**：`prepare` 失败则根本走不到审批；`verify:release` 的证据
  （发布件清单 / files 纪律 / koishi peer 契约 / publishConfig）直接留在运行日志里，
  供审批时核对。
- **tag 在发布成功之后**：tag 只在 npm 上确实上架后创建，且指向 `github.sha`（构建与
  发布用的同一棵树），不用「此刻的 main」。

## 2. 触发与幂等

- 每次 push 到 main 都会跑 `prepare` 的**检测步**：`npm view <name>@<version>` 命中 →
  `needed=false`，安装 / 门禁 / 构建全部跳过，运行以绿色空转结束。**发布与否只看
  版本在不在 registry**，不看提交信息、不看 changeset。
- 同一版本只可能成功发布一次：哪怕重跑，检测步也会把 `needed` 判成 false；`publish`
  里的 `npm publish` 另有 registry 侧兜底（版本冲突直接拒绝）。
- `concurrency: group: release` 且不取消进行中的运行——两个运行同时走到 `publish`
  会撞版本号。
- `workflow_dispatch` 用于补发与重跑。**它是在被 dispatch 的那个 ref 上取工作流文件
  的**，「只许 main 发」由 environment 的 Deployment branches 策略保证（见 §3.1）。

## 3. 一次性配置（按顺序，均为仓库 / npm 侧设置）

> 状态：§3.1 与 §3.3 已于 2026-10-25 完成；§3.2 每次重建后**当天必须完成首发**
>（2 天熔断，见下）。

### 3.1 Environment `release`（先建好，再合并 release.yml）

Settings → Environments → New environment，名字 **`release`**（必须与 npm 信任配置的
environment claim 严格同名）：

- 勾 **Required reviewers**（本人即可，可自审）。
- 关闭 **Allow administrators to bypass configured protection rules**——否则管理员可以
  跳过审批。自审仍然可用（`Prevent self-review` 保持关闭），单人维护不会因此锁死。
- **Deployment branches and tags** → Selected branches and tags → 只加 `main`。

#### 为什么保留 environment（单维护者也要）

1. **npm 版本事实上不可撤回**：72 小时后不能 unpublish，Koishi 市场按版本索引并
   同步；发错只能再发一版覆盖。
2. **审批是「不可逆动作」前唯一的人工停顿**，也是 token 被窃后唯一的告警闸：收到
   一条意料之外的 deployment 审批请求，本身就是信号。
3. **分支钉死**：npm 的 claim 只绑 repo + workflow 文件名 + environment，**不绑分支**；
   `workflow_dispatch` 可以在任意 ref 上取工作流文件。Deployment branches 是把
   「只许 main 发」落到实处的机制。

想减摩擦时：删 Required reviewers、保留 environment 与 Deployment branches 即可——
claim 绑定与分支门禁都还在。**不要连 environment 一起删**。

### 3.2 npm 信任配置（逐包，且只有 2 天有效期）

npm 的信任配置是**逐包**的，registry 只认「repository + workflow 文件 + environment」
三项 claim 与该包记录精确相符的那一条。新建的配置必须在 **2 天内完成首次成功发布**，
逾期失效且不可编辑——只能 revoke 后重建。**所以：配置与发版要排在同一天。**

本机（npm ≥ 11.15，先 `npm login`）：

```powershell
npm login
npm trust github "koishi-plugin-kurobridge" --file release.yml --repo Kuro-Bridge/Adapter-koishi --environment release --allow-publish --yes

# 核对：应看到 file / repo / env / 仅 publish 权限
npm trust list "koishi-plugin-kurobridge"
```

- `--file` 只写文件名（相对 `.github/workflows/`），不要带目录。
- 不要加 `--allow-stage-publish`：本仓不走 staged publish。
- 已有失效记录：`npm trust revoke "koishi-plugin-kurobridge" --id "<id>"` 后重建。

### 3.3 分支与 tag 保护

本仓维护者直推 main、不接受外部 PR，所以**不需要** PR / CODEOWNERS 规则；但发布链
依赖「git 历史不可改写」：

- main：`保护主分支`（Restrict deletions + Block force pushes + 线性历史 + 签名）。
  注意它给管理员开了 bypass——管理员仍可 force-push；要硬保护就关掉 bypass（代价是
  自己以后必须签名提交）。
- `v*` tag：`protect-release-tags`（Restrict deletions + Restrict updates）。**不要**加
  Restrict creations——`tag` job 用 `GITHUB_TOKEN` 创建新 tag 时会被挡。

## 4. 日常发布

1. 按惯例在 `.changeset/` 写条目（勿攒）；改动进 main。
2. 本地一条命令完成 bump 与验证：

   ```bash
   bun run release        # changeset version → bun run gate → bun run verify:release
   ```

   `verify:release` 依赖 `lib/`（gate 已含 build）。本地不再有 `npm publish`。
3. 提交并推送 main（简体中文提交信息，含 bump 后的 `package.json` 与 `CHANGELOG.md`）。
4. `Release` 自动触发，`prepare` 日志里留下发布件证据（清单 / files 纪律 / peer 契约）。
5. **审批前核对**（GitHub → Actions → 该次 Release 运行 → Review deployments）：
   - 版本号与 bump 级别（0.x 阶段：API 破坏 → minor，修复 → patch）；
   - CHANGELOG 与 changeset 条目一致；
   - **`.github/workflows/release.yml` 本身是否被改**——改它等于改发布权。
6. 批准后 `publish` 先跑 `verify-trust.ts` 换一次包级 token（404 会直接报配置缺失），
   再 `npm publish`。随后 `tag` 创建 `v<version>`。
7. 核对：

   ```powershell
   npm view "koishi-plugin-kurobridge" version dist.attestations --json
   git ls-remote --tags origin "refs/tags/v<version>"
   ```

   `dist.attestations` 存在即该版本经 OIDC 发布并带 provenance（来源 commit 与
   workflow 可在 npmjs.com 包页面核验）。Koishi 市场从 npm 索引同步，无需额外步骤。

## 5. 补发与排障

| 现象 | 原因 | 处置 |
|---|---|---|
| `prepare` 显示 `needed=false` | 该版本已在 registry | 正常空转；要发新内容先 bump 版本 |
| `publish` 报 404 / 最终 `ENEEDAUTH` | 信任配置缺失 / claim 不符 / 超过 2 天失效 | 按 §3.2 重建，**当天**重跑 dispatch |
| `E422 Failed to validate repository information` | `package.json` 的 `repository` 与 OIDC 来源不符（改名 / 转移 owner 后） | 同步 `repository.url` 与仓库实际地址 |
| CI 金样本对表红 | 上游 `@kuro-bridge/protocol` 发了新版（独立解析面漂移） | 核对上游变更语义后升对表锚，随修复发版 |
| 审批拖过 30 天，artifact 被清理 | 保留期到期 | `workflow_dispatch` 重跑（版本未上架会重新构建） |
| 上架成功但 tag 缺失 | `tag` job 被规则集或权限挡住 | 手工补 tag（见下） |
| `npm view` 刚发完 404 | registry 202 异步处理 | 等几分钟，用版本端点复核；不要立刻重发 |
| tag 已存在但指向别的 commit | 历史 tag 冲突 | `tag` job 会红退；核对后删旧 tag 再重跑（仅在该版本未上架时） |

手工补 tag（发布成功、tag 缺失时）：

```powershell
git fetch origin main
git tag -a "v<version>" -m "发布 koishi-plugin-kurobridge@<version>" "<发布时的 commit>"
git push origin "v<version>"
```

## 6. 回滚

| 动作 | 做法 |
|---|---|
| 刚上架、几乎无下载（72 小时内） | `npm unpublish "koishi-plugin-kurobridge@<version>"`；会打断已装该版本的用户，慎用 |
| 已有下载 | 保持在线，发下一版本修复 |
| 版本内容错误但语义只是标记问题 | `npm deprecate "koishi-plugin-kurobridge@<version>" "<原因>"` |
| tag 误打 | `git tag -d "v<version>"`，再 `git push origin --delete "v<version>"`（仅在该版本确认未发布时） |

## 7. 安全边界

- **发布权 = 能让 `release.yml` 在 main 上跑起来 + 能过 `release` environment 审批。**
  改 `.github/workflows/release.yml`、`scripts/verify-release.ts` 与
  `scripts/verify-trust.ts`、`package.json` 的 `files` / `scripts` / `publishConfig`
  都等于改发布面，应随功能变更一起审。
- 无长期 npm token、无 npm secret、无 GitHub App：OIDC 每次换**包级**短时 token，
  发布产物自动带 provenance。
- `publish` 环不 install、不 build、`--ignore-scripts`：构建期代码不进入持 token 的
  job。`verify-trust.ts` 只做一次 fetch，换到的 token 不打印、不落盘。
