# 架构总览

`koishi-plugin-kurobridge`（下称本插件）是 `kurobridge-ws` 的 Koishi v4 官方参考对端，在 KuroBridge 生态中承担两个职责：

- **WS 客户端**：主动连入 MC 侧 KuroBridge 服务端（KuroAdapter / KuroAdapter-Pure），子协议 `kurobridge-ws.v1`，不监听任何端口；断线重连由本插件状态机自担。
- **平台渲染唯一归属**：Koishi 元素 → 游戏文本的降级、`§` 色码剥离与长度收敛只出现在本仓。

## 生态位置

协议契约 SSOT 在 KuroProtocol 仓，经 npm 包 `@kuro-bridge/protocol` 消费；MC 侧是 WS 服务端（对端主动连入，服务端不回连），聊天侧是 WS 客户端。本插件是聊天侧官方对端；同一服务端可并存多个对端（如 napuketto 等第三方实现），多对端绑定同一频道会重复收到游戏事件——这是设计语义，需要隔离就让各对端绑定不同频道。

## 分层与依赖

五层单向依赖，平台无关部分与 Koishi 装配严格分离：

```text
src/index.ts                 装配层  Koishi 插件装配（全仓唯一 import koishi 的源文件）
  └─ src/adapter.ts          核心层  平台无关适配核心（绑定镜像 / 过滤链 / pending 关联）
       ├─ src/translate.ts   翻译层  纯函数（元素降级 / 模板渲染 / 色码剥离 / 截断）
       └─ src/connection.ts  连接层  WS 客户端状态机（握手 / 心跳 / 退避重连）
            └─ src/protocol/index.ts  协议出口  re-export @kuro-bridge/protocol
```

- 核心层不 import koishi：logger、宿主回调、连接节奏参数全部依赖注入，可脱离 Koishi 运行时独立测试。
- 装配层另直读两处下层常量：翻译层缺省（`DEFAULT_TEMPLATES` / `DEFAULT_MAX_MESSAGE_LENGTH`，用作 Schema 缺省）与协议出口的 `PROTOCOL_VERSION`（用于 hello 声明）。
- 仓内协议消费一律经 `src/protocol/index.ts` 单点出口，规范见 [protocol.md](protocol.md)。

## 两条数据链路

**平台 → MC（入站）**：Koishi `message` 事件 → 装配层过滤（无频道上下文跳过、bot 自消息跳过）→ 核心 `handleInbound` → 翻译层元素降级为文本 → 前缀分流：前缀命令走 `command` 帧（不做绑定过滤），其余走 `chat` 帧（仅绑定频道）。详见 [adapter.md](adapter.md) 与 [translation.md](translation.md)。

**MC → 平台（出站）**：服务端帧 → 连接层两段式解析 → 核心分发：四类游戏事件与命令回执经翻译层渲染后回调 `onGameEvent`，装配层按在线 bot 平台拼 `platform:channel` 后 `ctx.broadcast`；`status` 帧直通 `onStatus`。详见 [connection.md](connection.md) 与 [assembly.md](assembly.md)。

## 关键设计裁决

| 裁决 | 内容 | 详见 |
| :--- | :--- | :--- |
| 绑定表 SSOT 在服务端 | 本插件零频道配置：`hello_ack` 快照 + `bindings_updated` 全量热更本地镜像；命令不受绑定过滤（对齐服务端 dispatchCommand） | [adapter.md](adapter.md) |
| 平台无关核心 | `adapter.ts` / `translate.ts` / `connection.ts` 不 import koishi，除装配层外的测试不需 Koishi 运行时 | [testing.md](../development/testing.md) |
| 入站挂 message 事件 | 用 `ctx.on("message")` 而非 middleware：转发器不拦截指令流水，middleware 语义留给用户自己的指令插件 | [assembly.md](assembly.md) |
| 不做跨对端去重 | bot 自身消息自过滤防环；多对端同频道的重复投递是部署语义，插件层不去重 | [assembly.md](assembly.md) |
