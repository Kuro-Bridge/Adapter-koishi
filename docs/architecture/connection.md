# 连接层（connection.ts）

`KurobridgeConnection` 是 `kurobridge-ws` 客户端连接：子协议握手 + hello/hello_ack 关联 + 应用层心跳 + 感知 close code 的指数退避重连。连接语义对表 KuroProtocol 的 [peer-guide](https://github.com/Kuro-Bridge/KuroProtocol/blob/main/docs/peer-guide.md)。

## 状态机

状态集：`idle / connecting / establishing / established / backoff / stopped`。

| 迁移 | 触发 |
| :--- | :--- |
| `idle → connecting` | `start()`（幂等，非 idle 忽略） |
| `connecting → establishing` | WS open：立即发 hello（每次连接新 UUID），启动 hello 超时定时器 |
| `establishing → established` | hello_ack id 匹配且 ok：清定时器、重连计数清零、启动心跳、回调 `onEstablished(ack)` |
| `establishing → backoff` | hello 超时（缺省 10s）：主动 close 走重连，与服务端 10s hello 超时双保险 |
| 任意状态 → `stopped` | 用户 `stop()`（静默，不触发 `onEnded`、不再重连）或永久拒绝（见下表） |
| 连接中 / 已建立 → `backoff` | close 且 code 非 1002/1008：指数退避后重连 |

## close code 分诊

| close | 含义 | 处置 |
| :--- | :--- | :--- |
| 1002 | 协议错误（版本不匹配） | 永久停止：`onEnded({ permanent: true, code })`，不再重连 |
| 1008 | 策略违规（token 错） | 同上——版本/token 问题不可自愈，等待配置修正 |
| 1001 / 1006 / 其他 | 服务端关服 / 网络异常 | 指数退避重连 |

用户 stop 的静默由内部 `userStopped` 标志保证（与 close code 无关）：置位后一切 close 不再重连、不上报 `onEnded`。

## 握手

- WS 必带子协议 `kurobridge-ws.v1`，不带会被服务端握手期拒绝。
- hello 字段 `peerId` / `platform` / `version` / `protocolVersion` 必填，`token` 非空才带，`client` 可选（身份解析见 [assembly.md](assembly.md)）。
- hello_ack 按 header.id 与请求关联：id 不匹配 warn 忽略；ok → 建立（ack 携带 `channelBindings` 快照，交核心落地）；ok:false → 永久停止。
- hello_ack 版本与本地声明主版本不一致仅 warn（主版本协商在服务端，已接受才会回 ok）。

## 重连退避

- delay = min(`retryBaseDelayMs` × 2^attempt, `retryMaxDelayMs`) × (1 ± `retryJitter`)；attempt 每次失败 +1，established 成功后清零。
- 装配缺省：base 1000ms、cap 30000ms、jitter 0.2（±20%，防惊群）；测试注入快值、jitter 传 0 保确定性。
- ws `error` 事件只 warn——close 总会跟随 error 到达，状态迁移统一在 onClose 处理。

## 应用层心跳

- established 后每 `pingIntervalMs`（缺省 15000ms）发 `{ type: "ping", id, body: { timestamp } }`；`pingIntervalMs ≤ 0` 关闭。
- 服务端 30s 空闲判定只认应用层入帧，心跳间隔必须显著小于 30s。

## 发送门禁

`send()` 仅在 established 且 socket OPEN 时发出；否则 debug 日志并返回 false。不积压、不排队——未建立期间的消息直接丢弃（测试断言须等握手完成，见 [testing.md](../development/testing.md)）。

## 入站解析与未知帧容忍

两段式解析：`JSON.parse` 失败 → warn 丢弃（日志截前 200 字符）；`wireFrameSchema` 骨架校验失败 → warn 丢弃；收到服务端发来的 `hello` 帧（非预期方向）→ warn 忽略；`hello_ack` 由连接层内部消费（不进 `onFrame`）；其余按 type 查 `SERVER_FRAME_PARSERS` 表做具体 schema 校验，body 非法 warn 丢弃。

未知 type 的容忍（对齐 peer-guide）：

| 形态 | 处置 |
| :--- | :--- |
| 无 id（事件帧） | debug 忽略 |
| 有 id 且 type 以 `_result` 结尾（响应帧） | debug 忽略，不回执（防乒乓） |
| 有 id（请求帧） | 回 `<type>_result`，body `{ ok: false, error: "unknown frame type" }` |

## 对核心层的回调接口

| 回调 | 语义 |
| :--- | :--- |
| `onEstablished(ack)` | 握手成功，携带含绑定快照的 ack |
| `onFrame(msg)` | 服务端业务帧扁平消息（pong / chat / join / leave / death / status / bindings_updated / command_result / query_result） |
| `onEnded(reason)` | 仅永久停止时触发一次（用户 stop 不触发），含 permanent 标记、可得时的 close code 与人读描述 |
