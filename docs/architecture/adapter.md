# 适配核心（adapter.ts）

`KurobridgeAdapter` 是平台无关的适配核心：连接生命周期 + 绑定集镜像 + 入站过滤链 + 出站渲染分发 + 请求-响应关联。不 import koishi——logger、宿主回调、连接节奏参数全部依赖注入，可脱离 Koishi 独立测试（测试注入快值节奏）。

## 宿主接口

**回调面**（构造时注入，装配层的接线见 [assembly.md](assembly.md)）：

| 回调 | 语义 |
| :--- | :--- |
| `onLog(level, msg, extra?)` | 全部日志（连接层日志经此透传） |
| `onGameEvent(type, rendered, channel)` | 渲染完成的游戏事件 / 命令回执，宿主负责广播到平台频道 |
| `onStatus(status)` | 服务器状态帧透传（全服状态，无 channel） |

**调用面**：

| 方法 | 语义 |
| :--- | :--- |
| `start()` / `stop()` | 启动（幂等）/ 停止（先清理 pending 再停连接，静默） |
| `handleInbound(channel, userId, sender, elements)` | 入站消息统一入口（装配层 `message` 事件接入） |
| `forwardChat(channel, sender, elements)` | 平台 → 游戏聊天（绑定过滤 + 降级 + chat 帧） |
| `forwardCommand(channel, userId, command)` | 群指令 → 游戏命令（不做绑定过滤） |
| `query(kind)` | `status` / `bindings` 查询，返回 Promise |
| `getBindings()` | 当前绑定频道集快照（调试用） |

## 绑定集镜像

绑定表 SSOT 在服务端，本地只持镜像：握手成功时 `hello_ack.channelBindings` 快照落地，`bindings_updated` 帧全量热更（与握手快照同一路径）。本插件无任何频道配置项。

## 入站过滤链（handleInbound）

```text
元素降级（null = 不发） → 命令前缀分流 → chat（绑定过滤） / command（不过滤）
```

1. `degradeElements` 为 `null`（降级后空白）→ 丢弃。
2. 内容以 `commandPrefix`（缺省 `/`）开头 → 剥前缀并 trim，空命令忽略；否则登记 pending 后发 `command` 帧（body `{ command, source: { channel, userId } }`）。**命令不做绑定过滤**——对齐服务端 `dispatchCommand` 不做绑定过滤的语义。
3. 其余发 `chat` 帧：频道不在绑定集内 debug 丢弃；在则 `{ channel, sender, content }` 发出。

## 请求-响应关联

`command` 与 `query` 均以 UUID 为关联键：

- **commandPending**（`UUID → 来源频道`）：command 帧发送成功后登记；`command_result` 按登记路由回来源频道，渲染后经 `onGameEvent("command_result", ...)` 交宿主广播；无对应 pending（迟到 / 重复回执）debug 丢弃。发送失败不登记。
- **queryPending**（`UUID → { resolve, reject, timer }`）：连接未建立直接 reject；query 帧发送成功后登记，`query_result` resolve 对应 Promise；超时（缺省 10s，对齐服务端 IPC 超时）reject 并清理。
- **stop() 统一清理**：全部未决查询 reject（不留悬挂 Promise 与定时器），命令 pending 清空（回执作废）。

## 服务端帧分发（handleFrame）

| 帧 | 处置 |
| :--- | :--- |
| `pong` | 忽略（心跳应答） |
| `chat` / `join` / `leave` / `death` | 取 body 字段渲染模板后经 `onGameEvent` 回宿主；字段名差异：join/leave 取 `playerName`，death 取 `player` + `message`（照抄协议 SSOT，不「修正」） |
| `status` | 直通 `onStatus`（全服状态，无 channel） |
| `bindings_updated` | 落地为新绑定快照 |
| `command_result` / `query_result` | 按 UUID 关联（见上节） |

渲染细节（模板、色码、截断）见 [translation.md](translation.md)；帧解析与未知帧容忍见 [connection.md](connection.md)。
