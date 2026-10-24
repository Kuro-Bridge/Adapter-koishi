# 翻译层（translate.ts）

纯函数层，平台渲染唯一归属：平台 → MC 的元素降级与 MC → 平台的模板渲染都只出现在本仓。不 import koishi——`TreeElement` 是 Koishi `h` 元素的最小结构面（`type / attrs / children`，text 内容承载在 `attrs.content`），装配层直接传 `session.elements` 即结构匹配。

## 入站：元素树降级（degradeElements）

深序遍历元素树，按下表映射后拼接并 trim；结果为空串返回 `null`——协议要求 chat content 非空，调用方以此判定不发。

| 元素 | 降级结果 |
| :--- | :--- |
| `text` | `attrs.content` |
| `at` | `id === "all"` → `@全体成员`；否则 `@{name ?? id}` |
| `img` / `image` | `[图片]` |
| `face` | `[表情]` |
| `quote` / `reply` | `[回复]`（子树是被引用的消息，不展开） |
| `br` | 换行 |
| `p` | 递归 children |
| `audio` / `video` / `voice` / `file` / `forward` / `node` / `message` | 静默跳过（无法降级为文本） |
| 其他未知元素 | 递归 children（容器容忍） |

## 出站：模板渲染管线

四类游戏事件（chat / join / leave / death）与命令回执共用一条后处理管线：

```text
renderTemplate（占位符替换） → stripColorCodes（开关） → truncateText（UTF-16 截断）
```

- **占位符**：`{player}` / `{content}` / `{message}`；缺省变量代空串，未知占位符原样保留。chat 用 `{content}`、death 用 `{message}`，`{player}` 四类通用。
- **death 兜底**：`message` 为空串或缺失时以「死亡了」代入（Bukkit deathMessage 为 null 时服务端以空串下发）。
- **色码剥离**：`§[0-9a-fk-or]`（MC legacy 格式化码）整体移除；`stripColorCodes` 开关控制，缺省开——色码在多数聊天端显示为乱码。
- **截断**：按 UTF-16 码元（`String.length`）计，超 `maxMessageLength`（缺省 1500）丢弃超限部分并追加「…(截断)」。

模板缺省值（`DEFAULT_TEMPLATES`，装配层 Schema 直接引用为缺省）：

| 模板 | 缺省 |
| :--- | :--- |
| `chatTemplate` | `[{player}] {content}` |
| `joinTemplate` | `{player} 加入了服务器` |
| `leaveTemplate` | `{player} 离开了服务器` |
| `deathTemplate` | `{player} {message}` |

## 命令回执渲染（renderCommandResult）

| command_result body | 渲染结果 |
| :--- | :--- |
| `ok: false` | `命令失败：{error}` |
| `ok: true` 且 output 为空 | `（命令执行成功，无输出）` |
| `ok: true` 且 output 非空 | 各行 `join("\n")` |

渲染结果同样过色码剥离与截断管线。
