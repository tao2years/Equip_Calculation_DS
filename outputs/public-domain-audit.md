# 公共领域数据覆盖审计

生成：2026-11-03T10:14:26.753Z

数据版本：`public-catalog-2026-11-03`

证据等级：公开目录已编译，**未经过当前游戏客户端验证**。

## 执行摘要

- 角色：351，其中 351 条带基础属性，351 条带每级成长，351 条带技能文本。
- 装备定义：682，677 条已映射槽位；仍有 5 条特殊定义保持 unknown。
- 神器：147，147 条带主属性，147 条带 0–20 级强化属性曲线，147 条带 0–5 阶精炼效果文本。两类成长不可混用。
- 套装/变体家族：248；其中 144 组官方 Wiki 静态效果通过白名单语法解析，加上 4 个种子定义，共 148 组面板加成进入求解器。条件型效果只保存原文，不假装可计算。

这些数据适合充当所有账号共享的 `GameDataVersion`。它们不能回答用户拥有什么，也不能替代登录态采集器。

## 角色数据可直接承载的字段

`externalId / name / season / rarity / element / orientation / attackType / baseStats / perLevelGrowth / skills / inspirations`

角色稀有度分布：

| 稀有度 | 数量 |
|---|---:|
| Legendary | 161 |
| Epic | 111 |
| Rare | 71 |
| Common | 7 |
| Special | 1 |

角色元素分布：

| 元素 | 数量 |
|---|---:|
| Radiance | 61 |
| Lightning | 60 |
| Ice | 59 |
| Necrosis | 59 |
| Fire | 56 |
| Poison | 56 |

## 装备与神器

装备槽位分布：

| 槽位 | 定义数 |
|---|---:|
| chest | 168 |
| gloves | 167 |
| helmet | 147 |
| weapon | 147 |
| negative_rune | 24 |
| positive_rune | 24 |
| unknown | 5 |

神器主属性覆盖：

| 属性 ID | 出现次数 |
|---|---:|
| atk_flat | 73 |
| hp_flat | 42 |
| accuracy | 29 |
| atk_pct | 29 |
| def_flat | 25 |
| hp_pct | 23 |
| crit_rate | 17 |
| crit_damage | 16 |
| enlightenment | 16 |
| def_pct | 9 |
| resistance | 7 |
| skill_haste | 6 |
| attack_speed_pct | 2 |

建议继续保持两层：

1. `ArtifactDefinition` 保存所有账号共享的名称、品质、初始属性、强化曲线和效果原文。
2. `OwnedArtifact` 只保存某账号是否拥有、当前精炼/强化、锁定和穿戴者，并引用 definition ID。

装备同理：公共定义描述“可能存在什么”；`OwnedGear` 描述随机词条、强化等级、锁定和穿戴关系。

## 计算可用性

当前可直接进入面板求解的属性共 13 类：`hp_flat`、`hp_pct`、`atk_flat`、`atk_pct`、`def_flat`、`def_pct`、`crit_rate`、`crit_damage`、`accuracy`、`resistance`、`enlightenment`、`skill_haste`、`attack_speed_pct`。

七槽位模型为：`helmet`、`weapon`、`chest`、`gloves`、`positive_rune`、`negative_rune`、`artifact`。

以下仍不能作为已验证规则：星级/灵感成长、固定值与百分比的最终结算顺序、所有条件套装/神器效果、国服当前版本差异、重击率溢出机制。已解析静态套装仍属于“官方 Wiki 文本编译、未经客户端实测”。

## 数据质量与下一步

- 角色/装备/神器 external ID 重复数分别为 0/0/0。
- 公共目录在仓库中可复算；来源、快照和编译器分离。
- 下一步不是继续堆 Wiki 摘要，而是用目标客户端截图建立版本映射和 golden cases，把公共 definition 与账号 owned records 对齐。
