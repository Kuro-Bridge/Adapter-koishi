# KuroBridge Adapter-koishi 开发者文档

`koishi-plugin-kurobridge` 是 `kurobridge-ws` 的 Koishi v4 官方参考对端：以 WS 客户端身份主动连入 MC 侧 KuroBridge 服务端，桥接 Koishi 接入的聊天平台与 Minecraft。面向用户的安装、配置速查与部署指引见根目录 [readme](../readme.md)；本目录面向维护者与贡献者，按模块拆解源码机制与开发约定。

## 文档地图

| 文档 | 主题 | 对应源码 |
| :--- | :--- | :--- |
| [architecture/overview.md](architecture/overview.md) | 生态定位、分层架构、数据链路、关键设计裁决 | 全仓 |
| [architecture/protocol.md](architecture/protocol.md) | 协议依赖单点出口与 golden 契约 | `src/protocol/` |
| [architecture/connection.md](architecture/connection.md) | WS 客户端状态机、握手、心跳、退避重连 | `src/connection.ts` |
| [architecture/translation.md](architecture/translation.md) | 元素降级、模板渲染、色码剥离、截断 | `src/translate.ts` |
| [architecture/adapter.md](architecture/adapter.md) | 绑定镜像、入站过滤链、请求-响应关联 | `src/adapter.ts` |
| [architecture/assembly.md](architecture/assembly.md) | Koishi 装配、配置规范、广播路由 | `src/index.ts` |
| [development/testing.md](development/testing.md) | 测试体系：假服务端、契约、桩与冒烟 | `src/*.test.ts`、`src/test-support.ts` |
| [development/workflow.md](development/workflow.md) | 工作区、门禁、构建产物、Changesets、已知坑 | 工程配置文件 |
| [development/release.md](development/release.md) | OIDC 可信发布：流水线、一次性配置、日常发版、排障 | `.github/workflows/release.yml`、`scripts/verify-*.ts` |

## 阅读路线

- **使用与部署**：读根 [readme](../readme.md) 即可，无需进入本目录。
- **理解机制**：按 overview → protocol → connection → translation → adapter → assembly 顺序阅读，与五层依赖方向一致。
- **参与开发**：先读 [development/workflow.md](development/workflow.md)（环境与门禁），再按改动模块读对应 architecture 篇；触碰协议消费面时必读 [development/testing.md](development/testing.md)。

## 约定

- 文档与代码注释统一简体中文，不使用 Emoji。
- 产品叙事使用 KuroBridge；`Adapter-koishi` 仅指涉本仓库，`koishi-plugin-kurobridge` 仅指涉 npm 包。
- 协议事实以 KuroProtocol（npm 包 `@kuro-bridge/protocol`）为 SSOT；文档与代码漂移时以代码为准并回修文档。
