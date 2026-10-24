# 测试体系

`bun run test`（vitest run）。测试与源码同置 `src/`（`*.test.ts`），因此同时被 biome 与 tsc 覆盖（两者均只扫 src）。分层与源码一一对应：协议 golden 契约、连接层状态机、翻译层表驱动纯函数、适配层假服务端全链路、装配层集成；`src/test-support.ts` 是测试支撑，不进构建产物（构建入口仅 `src/index.ts`）。

## 假服务端（test-support.ts）

`startFakeKurobridgeServer()` 以 ws 库起真端口（`listen(0)` 动态分配）的假 `kurobridge-ws` 服务端：

- `handleProtocols` 复刻 MC 侧 NodeWsServer 的握手校验：不带子协议 `kurobridge-ws.v1` 直接拒连（`handshakes` 记录每次握手结果）。
- `frames` 跨连接累计记录客户端帧（已 JSON 解析）；`onClientFrame` 可注入逐帧应答行为；`nextConnection()` 等待下一个连接。
- `send` / `close`（指定 close code）/ `stop`；`stop()` 先 terminate 全部连接再 `wss.close`——残留连接会让 close 回调永不触发、用例挂起。

时序断言用 `waitFor`（10ms 步进轮询，超时 2s）而非挂事件：ws 时序依赖事件循环，跨层断言轮询更稳。

**时序注意**：连接层未 established 时出站帧直接丢弃（不积压，见 [connection.md](../architecture/connection.md)），断言入站转发须等握手完成后注入。

## 测试桩与快值

- **装配层 `vi.mock("koishi")`**：koishi 运行时 import `.yml` 本地化文件，Bun 原生支持而 vitest 的 Node 运行时不认——用无操作 Schema 桩替换（只测配置声明面）；类型检查仍走真实 koishi 类型（`import type`）。
- **节奏快值注入**：连接 / 适配层参数（重连 base/cap、jitter、各类超时）全部可注入，测试传快值；`retryJitter` 传 0 保确定性。

## 产物冒烟

CJS 产物（`lib/index.cjs`）的全链路冒烟（假服务端握手、token / client 上报、版本解析）只能在 **Bun 宿主**用 `bun -e` 执行：koishi 运行时 import yml，Node 宿主下加载即炸（同上缘由）。发布前跑一次。

## golden 契约

协议 golden 两层测试（线格式对表 + 包内金样本）的机制与覆盖见 [architecture/protocol.md](../architecture/protocol.md)。
