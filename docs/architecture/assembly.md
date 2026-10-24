# Koishi 装配与配置（index.ts）

装配层是适配核心与 Koishi 宿主的唯一粘合处（全仓唯一 import koishi 的源文件）。插件名 `kurobridge`；依赖注入声明 `inject = { database: "optional" }`——无数据库的部署仍可跑平台 → 游戏方向，仅广播侧降级（见下）。

## 配置项

| 配置项 | 类型 | 缺省 | 说明 |
| :--- | :--- | :--- | :--- |
| `url` | string | 必填 | KuroBridge 服务端地址（`ws://` / `wss://`，对应 MC 侧 ws 段配置） |
| `token` | string | `""` | 鉴权 token；MC 侧配置非空 token 时必须一致，否则 close 1008 永久停止 |
| `name` | string | `"koishi"` | 对端实例标识（hello.peerId，服务端日志辨识用） |
| `client` | string | 运行时算 | 自报身份串，缺省 `koishi-plugin-kurobridge/<版本>` |
| `commandPrefix` | string | `"/"` | 消息以该前缀开头 → 游戏命令，不再作为聊天发送 |
| `pingIntervalMs` | number | `15000` | 应用层心跳间隔（ms），须显著小于服务端 30s 空闲阈值 |
| `chatTemplate` 等四模板 | string | 见 [translation.md](translation.md) | chat / join / leave / death 渲染模板 |
| `stripColorCodes` | boolean | `true` | 剥离 `§` 色码 |
| `maxMessageLength` | number | `1500` | 出站文本上限（UTF-16 码元） |

配置经 `Schema` 声明，Koishi 控制台可编辑；Schema 缺省直接引用翻译层常量（`DEFAULT_TEMPLATES` / `DEFAULT_MAX_MESSAGE_LENGTH`），单一出处。

## hello 身份解析

| 字段 | 取值 |
| :--- | :--- |
| `peerId` | `config.name` |
| `platform` | 固定 `"koishi"` |
| `version` | 运行时读取本插件 `package.json` 的 `version`（CJS `__filename` 优先、`import.meta` URL 兜底）；读取失败退 `"unknown"` 并 warn |
| `protocolVersion` | `PROTOCOL_VERSION`（协议出口常量） |
| `token` | `config.token` 非空才携带 |
| `client` | `config.client`，缺省 `koishi-plugin-kurobridge/<版本>`（版本解析失败为裸名） |

## 入站挂点与过滤

- 挂 `ctx.on("message")` 而非 middleware：转发器不拦截 / 改写指令流水，middleware 语义留给用户自己的指令插件。
- `channelId` / `userId` 缺失（私聊、无频道上下文）跳过；`userId === selfId`（bot 自身消息）跳过防环。
- 余者交 `adapter.handleInbound(channel, userId, session.username ?? userId, session.elements ?? [])`，过滤链见 [adapter.md](adapter.md)。

## 游戏事件广播（onGameEvent 接线）

帧内 `channel` 是绑定表裸标识（如 QQ 群号），而 koishi 的 broadcast 按 `platform:id` 限定形式路由，因此对每个在线 bot 平台各拼一个 `platform:channel` 目标（去重）：

- 无在线 bot（拼不出目标）→ 直接返回。
- **数据库服务缺失（optional 注入未启用）→ warn 并跳过广播**——broadcast 经频道表路由需要 database 服务；此时平台 → 游戏方向不受影响。
- 广播失败 `.catch` 后 warn，不中断插件。

## 状态与生命周期

- `onStatus`：服务器状态帧以 info 日志输出 `tps` / `onlinePlayers` / `uptimeSeconds`。
- `ctx.on("dispose")` → `adapter.stop()`（清理 pending、静默停连）。
- 装配时注入连接节奏：hello 超时 10s、退避 1s 起 ×2 封顶 30s ±20% 抖动、query 超时 10s、心跳取 `pingIntervalMs`——语义见 [connection.md](connection.md) 与 [adapter.md](adapter.md)。
