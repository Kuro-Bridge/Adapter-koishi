# 开发与维护

## 环境与工作区

本仓是 `koishi-dev` 工作区的 external 成员：依赖由工作区根提升提供，**先在 koishi-dev 根执行一次安装**，项目内无需再 install；包管理器一律 Bun。

## 门禁与提交

| 命令 | 作用 |
| :--- | :--- |
| `bun run check` | 门禁：biome check + tsc --noEmit（提交前必跑） |
| `bun run fix` | biome 自动修复 + 类型检查 |
| `bun run test` | vitest 全量 |
| `bun run build` | tsdown 构建 `lib/index.cjs` + `.d.ts` |
| `bun run release` | changeset version → tsdown → npm publish |

**本仓无 pre-commit 钩子**，门禁不会拦提交——每次提交前手动跑 `bun run check`；逐功能小步提交，简体中文提交信息（`feat:` / `fix:` / `docs:` / `chore:`），主分支直提。仓内开发约定速查见 [AGENTS.md](../../AGENTS.md)。

## 代码风格（biome + tsconfig 强制）

- 4 空格缩进、行宽 100、双引号、尾逗号 all、LF；`organizeImports` 开启（连 export 列表排序也管）。
- TypeScript strict 全家桶关键项：`noUncheckedIndexedAccess`、`noPropertyAccessFromIndexSignature`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`（类型导入一律 `import type`）、`erasableSyntaxOnly`（禁 enum 与构造器参数属性，用 const 对象 + 联合类型替代）。
- `noFloatingPromises` 为 error：异步调用必须 await 或显式 `void` / `.catch`。
- 相对导入按 NodeNext 带 `.js` 后缀。

## 构建产物

tsdown 入口 `src/index.ts`，产物固定 CJS（`lib/index.cjs`）：Koishi loader（Node 宿主）用 `require()` 加载插件，Bun 宿主的 `require(esm)` 对 CJS 同样兼容——CJS 是两类宿主的最大公约数；源码保持 ESM（`package.json` 为 `type: module`）。

- 依赖全部 external（koishi 为 peer 单实例）；协议包 0.4.0 起 exports 含 `require` 条件，按普通 external 运行时 require（见 [architecture/protocol.md](../architecture/protocol.md)）。
- dts 打包对 koishi 系（`@satorijs` / `@koishijs` / `cordis` / `minato` / `cosmokit`）`neverBundle`——其 d.ts 是 CJS 语法（`export =` / namespace 成员 re-export），dts 打包无法解析；产物 d.ts 保留 import，消费端由 koishi 提供类型。
- `exports` 三态：`types` → `lib/index.d.ts`、`development` → `src/index.ts`、`default` → `lib/index.cjs`（开发态直读 TS，发布件走 CJS）。

## Changesets

- 每次用户可见改动随提交在 `.changeset/` 写条目，勿攒到发版前。0.x 阶段：API 破坏 → minor，修复 → patch；纯 chore 不需要。
- 已知坑：全新仓库首次 commit 之前 `changeset status` 报 "Failed to find where HEAD diverged"——先做初始提交即可。
- 发版 `bun run release`；发不出先查 `.changeset/` 是否有 pending 条目。

## 已知坑实录

- **Schema 显式注解 + exactOptionalPropertyTypes**：对空 object 的 Schema 推断会触发 TS2375——显式注解 `Schema<Config>` 并为 Config 声明全字段（现状做法），不要用无字段的推断形态。
- **koishi import 实为 shim**：peerDependencies 是 `npm:@koishi-ce/koishi-shim`，直接 `import {} from "koishi"` 即可。
- **索引签名键访问的规则冲突**：tsc `noPropertyAccessFromIndexSignature` 与 biome `useLiteralKeys` 在 Record 字面量 key 访问上互斥——动态 key 用 `attrString(el, key)` 式取值助手绕开（见 `src/translate.ts`）。
- **协议帧字段名差异**：death 帧字段是 `player` / `message`，join / leave 是 `playerName`——照抄协议 SSOT，不「修正」。
- **服务端 30s 空闲只认应用层帧**：心跳间隔必须显著小于 30s（缺省 15s），见 [architecture/connection.md](../architecture/connection.md)。

## 参考资源

- 连接语义与协议契约对表：KuroProtocol [peer-guide](https://github.com/Kuro-Bridge/KuroProtocol/blob/main/docs/peer-guide.md)。
- 兄弟插件：宿主工作区 `external/` 下的其它插件是现成范式，拿不准的写法先看它们。
