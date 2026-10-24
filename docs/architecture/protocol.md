# 协议依赖与 golden 契约

协议线格式的 SSOT 是 KuroProtocol 仓，本插件经 npm 包 `@kuro-bridge/protocol`（`package.json` 依赖 `^0.4.0`）消费，不做任何本地镜像或产物内联。协议包是普通 external 运行时依赖：0.4.0 起 `exports` 含 `require` 条件，CJS 产物可直接解析；tsdown 配置 `deps.bundle: false`，协议包不打进产物。

## 单点出口

`src/protocol/index.ts` 是协议依赖的唯一出口，从包具名 re-export 全部所需类型与值（各帧构造器、zod schema、`encodeFrame`、`PROTOCOL_NAME` / `PROTOCOL_VERSION` / `WS_SUBPROTOCOL`、`isProtocolVersionCompatible`、`validateFixture` 等）。

规则：**仓内代码一律 `import ... from ".../protocol/index.js"`（或等价相对路径），禁止直探包内深层模块**——协议升级只改这一处。`PROTOCOL_VERSION` 同时驱动两处：hello 握手声明（装配层）与金样本版本目录定位（契约测试）。

## golden 契约测试

两层测试锁定发布件与本仓预期不漂移，上游协议改动若破坏预期，`bun run test` 立即红。

**`src/protocol/golden.test.ts`——线格式对表**，对象为包导出：

- 常量逐字：`PROTOCOL_NAME = "kurobridge-ws"`、`PROTOCOL_VERSION = "0.4.0"`、`WS_SUBPROTOCOL = "kurobridge-ws.v1"`。
- 版本兼容语义：`isProtocolVersionCompatible` 主版本号相同即兼容，非法版本串不兼容。
- `encodeFrame` 逐字节：事件帧 header 仅 `type` 无 `id`；请求帧 `type + id`（id 存在才产生字段）；body 键序 = 传入对象插入序。
- 双向 schema：正形收窄为扁平消息、错形拒绝；方向误用与 `wsOutboundFrame` 全帧集。

**`src/protocol/golden.fixtures.test.ts`——包内金样本**。0.4.0 起发布件自带金样本夹具（fixtures 不经 `exports` 暴露，测试经 `require.resolve` 定位包根后按文件读取）：

- 版本目录对齐：`fixtures/v<major.minor>` 与 `PROTOCOL_VERSION` 的 major.minor 一致，且 fixtures 根下只有当前版本目录。
- 全量夹具逐个通过包导出的 `validateFixture` 契约校验（不少于发布件声称的 16 份）。
- `SHA256SUMS` 双向完整性：清单逐条实算匹配，盘上文件全部被列出。

## 协议升级操作

1. `package.json` bump `@kuro-bridge/protocol` 版本并安装。
2. 若 re-export 面需要增删符号，只改 `src/protocol/index.ts`。
3. 跑 `bun run test`：golden 两层绿即线格式与金样本契约未破；红则对表 KuroProtocol 变更逐项适配——帧语义改动会波及 [connection.md](connection.md) 的解析分发表与 [adapter.md](adapter.md) 的帧分发。

帧形状、close code 语义等协议全文以 KuroProtocol 的 [peer-guide](https://github.com/Kuro-Bridge/KuroProtocol/blob/main/docs/peer-guide.md) 为准，本仓文档不复述。
