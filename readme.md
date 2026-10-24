<div align="center">

<img src=".github/assets/wordmark.svg" alt="KuroBridge Adapter-Koishi" width="560">

**kurobridge-ws 的 Koishi v4 官方参考对端**

<small>群聊 ↔ 游戏聊天 · 群指令 → 服务器命令 · 进服 / 退服 / 死亡 / 状态广播回群</small>

<p>
  <img src="https://img.shields.io/npm/v/koishi-plugin-kurobridge?style=flat" alt="npm：koishi-plugin-kurobridge">
  &emsp;
  <img src="https://img.shields.io/badge/宿主-Koishi%20%5E4.18-57606A?style=flat" alt="宿主：Koishi ^4.18">
  &emsp;
  <img src="https://img.shields.io/badge/角色-WS%20客户端-3E7C7C?style=flat" alt="角色：WS 客户端">
  &emsp;
  <img src="https://img.shields.io/badge/协议-kurobridge--ws%200.4.0-4C71A3?style=flat" alt="协议：kurobridge-ws 0.4.0">
  &emsp;
  <img src="https://img.shields.io/badge/许可-MIT-6E7781?style=flat" alt="许可：MIT">
</p>

<p>
  <a href="#安装与部署">安装与部署</a> ·
  <a href="#配置">配置</a> ·
  <a href="#注意事项">注意事项</a> ·
  <a href="#开发与发版">开发与发版</a> ·
  <a href="#english">English</a>
</p>

</div>

---

## 生态定位

```text
KuroBridge 生态（协议视角）
│
├─ 协议契约 SSOT · KuroProtocol（独立仓）
│    kurobridge-ws v0.4.0：zod schema + 对端规格书 + 16 份金样本
│    本插件经 npm 依赖 @kuro-bridge/protocol ^0.4.0 消费
│
├─ MC 侧 · WS 服务端（对端主动连入，服务端不回连）
│    ├─ KuroAdapter · 全量线：Paper JAR + 内嵌 Node 业务核心
│    └─ KuroAdapter-Pure · 纯净线：纯 Java Paper 插件
│
└─ 聊天侧 · WS 客户端（连入上述服务端）
     ├─ Adapter-koishi（← 本仓）· 官方对端：koishi-plugin-kurobridge（Koishi v4 插件）
     └─ napukettoqq 等第三方对端
```

- **本插件是 WS 客户端**：主动连入 MC 侧 KuroBridge 服务端（子协议 `kurobridge-ws.v1`），不监听任何端口；断线重连由本插件的状态机自担。
- **绑定关系由服务端决定**：哪些群与服务器互通（`channels` 绑定表）的 SSOT 在 MC 侧配置。
- **平台渲染只在本仓**：Koishi 元素 → 游戏文本的降级、`§` 色码剥离与长度收敛由本插件承担。

## 工作原理

五层单向依赖（装配 → 核心 → 翻译 → 连接 → 协议），平台无关部分与 Koishi 装配分离：

| 层 | 文件 | 职责 |
| :--- | :--- | :--- |
| 装配 | `src/index.ts` | Koishi 插件装配：`Schema` 配置面板、hello 身份上报、`ctx.on("message")` 入站与自过滤、单频道 `ctx.broadcast`、`dispose` 清理 |
| 核心 | `src/adapter.ts` | 平台无关核心：绑定集镜像（快照 + `bindings_updated` 热更）、入站过滤链、command / query 的 UUID pending、四事件分发 |
| 翻译 | `src/translate.ts` | 纯函数翻译：Koishi 元素树降级（text / at / img / face / quote / br / p）、四模板渲染、`§` 色码剥离、UTF-16 截断、`command_result` 三态 |
| 连接 | `src/connection.ts` | WS 客户端状态机：子协议握手、hello / hello_ack 关联、应用层心跳、close code 感知的指数退避重连（±20% 抖动）、未知帧容忍、三类永久停 |
| 协议 | `src/protocol/` | `@kuro-bridge/protocol` 依赖单一出口；golden 对表测试锁定发布件线格式，上游漂移立即红 |

连接语义（握手 / 心跳 / 关闭策略）对表 [peer-guide](https://github.com/Kuro-Bridge/KuroProtocol/blob/main/docs/peer-guide.md)。

## 安装与部署

安装二选一：Koishi 市场搜索 `kurobridge` 一键安装；或手动 `npm i koishi-plugin-kurobridge`。协议包 `@kuro-bridge/protocol` 作为运行时依赖自动安装，无需手动处理。

部署三步：

| 步骤 | 侧 | 操作 |
| :--- | :--- | :--- |
| 1 | MC 侧 | 安装 KuroBridge 插件（[KuroAdapter](https://github.com/Kuro-Bridge/KuroAdapter) 或 [KuroAdapter-Pure](https://github.com/Kuro-Bridge/KuroAdapter-Pure) 的 Paper JAR），在 config 的 `ws` 段固定端口、设置 `token`，并把目标群加入 `channels` 绑定表 |
| 2 | Koishi 侧 | 启用本插件，`url` 填 `ws://<服务器地址>:<端口>`，`token` 与 MC 侧一致 |
| 3 | 验证 | Koishi 日志出现 `kurobridge: 握手成功` 与绑定快照；群内发消息进游戏、游戏内发言回群 |

> [!WARNING]
> 协议为明文 WS（无 TLS）：跨公网部署必须走隧道——推荐反代 TLS 终结（`wss://`）或 wireguard。

## 配置

| 配置项 | 类型 | 缺省 | 说明 |
| :--- | :--- | :--- | :--- |
| `url` | string | **必填** | KuroBridge 服务端地址（`ws://` / `wss://`） |
| `token` | string | `""` | 鉴权 token；MC 侧配置了非空 token 时必须一致，否则 close 1008 且不重连 |
| `name` | string | `"koishi"` | 对端实例标识（hello.peerId，服务端日志辨识用） |
| `client` | string | 运行时算 | 自报身份串，缺省 `koishi-plugin-kurobridge/<版本>` |
| `commandPrefix` | string | `"/"` | 消息以该前缀开头 → 作为服务器命令发送（如 `/whitelist list`），否则进游戏聊天 |
| `pingIntervalMs` | number | `15000` | 应用层心跳间隔（服务端空闲阈值 30s，须显著小于） |
| `stripColorCodes` | boolean | `true` | 剥离 `§` 颜色代码（多数聊天端显示为乱码） |
| `maxMessageLength` | number | `1500` | 出站文本上限（UTF-16 码元，超长截断加「…(截断)」） |

<details>
<summary><b>消息模板</b>（chat / join / leave / death 四项）</summary>

| 配置项 | 缺省 | 说明 |
| :--- | :--- | :--- |
| `chatTemplate` | `"[{player}] {content}"` | 游戏聊天渲染模板 |
| `joinTemplate` | `"{player} 加入了服务器"` | 进服模板 |
| `leaveTemplate` | `"{player} 离开了服务器"` | 退服模板 |
| `deathTemplate` | `"{player} {message}"` | 死亡模板（死亡消息为空时以「死亡了」代入） |

占位符：`{player}` / `{content}` / `{message}`；缺省变量代空串，未知占位符原样保留。

</details>

## 注意事项

> [!CAUTION]
> **一条连接原则**：一个逻辑协议端只保持一条连接。同一 Koishi 实例不要配置多个 kurobridge 条目指向同一服务器，否则游戏内消息重复。

> [!NOTE]
> **多对端并存语义**：每个已握手对端都会收到全部游戏事件——两端绑定同一频道会重复广播，属设计语义；需要隔离就让两端绑定不同频道。

> [!NOTE]
> **管理员判定在 MC 侧**：command 帧由服务端 `admins`（`channel + userId`）匹配放行；非管理员收到 `命令失败：forbidden`。

## 开发与发版

```bash
bun install         # 先在宿主工作区根目录执行一次（workspace 成员依赖提升）
bun run check       # 门禁：biome check + tsc --noEmit
bun run test        # vitest：协议 golden + 连接 / 翻译 / 适配 / 装配（90 用例）
bun run build       # tsdown → lib/index.cjs（CJS，Koishi loader 用 require 加载）
bun run release     # changeset version → tsdown → npm publish
```

- **Changesets**：每次用户可见改动随提交写 `.changeset/` 条目（0.x：破坏 → minor，修复 → patch）。
- **exports 三态**：`types` → `lib/index.d.ts`；`development` → `src/index.ts`；`default` → `lib/index.cjs`。开发态直读 TS，发布件走 CJS。
- **协议依赖**：`@kuro-bridge/protocol ^0.4.0` 是真实运行时依赖（0.4.0 起 exports 含 `require`，CJS 产物可直接解析）；本仓 golden 测试锁定发布件线格式，上游协议漂移立即红。
- 约定详见 [AGENTS.md](AGENTS.md)；模块机制与开发文档见 [docs/README.md](docs/README.md)，变更明细见 [CHANGELOG.md](CHANGELOG.md)。

---

## English

`koishi-plugin-kurobridge` is the official Koishi v4 peer of the KuroBridge ecosystem: a WebSocket **client** that connects into a Minecraft-side KuroBridge server (`kurobridge-ws.v1`) and bridges chat platforms attached to Koishi with the game — group chat ↔ in-game chat, group commands → server commands, and join / leave / death / status broadcasts back to groups. Protocol frames come from `@kuro-bridge/protocol` (v0.4.0); connection semantics follow the [peer guide](https://github.com/Kuro-Bridge/KuroProtocol/blob/main/docs/peer-guide.md).

```bash
npm i koishi-plugin-kurobridge
```

*Repo renamed to `Adapter-koishi` (npm package name unchanged). Entirely original implementation, released under the [MIT License](./LICENSE).*
