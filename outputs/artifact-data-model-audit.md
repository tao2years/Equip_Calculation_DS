# 神器数据模型审计

更新：2026-11-03

## 执行摘要

原模型把神器的 0–20 属性成长误命名为 `refinementCurve`，而账号只保存一个 `refinement`，会混淆强化等级与精炼阶数。本轮已将公共计算字段更名为 `levelCurve`，账号拆分为 `level` 与 `refinement`，并建立“账号观测优先、公共曲线回退”的可追溯计算规则。

## 覆盖结果

| 检查项 | 结果 |
|---|---:|
| 神器定义 | 147 |
| 有属性曲线 | 147 / 147 |
| 曲线完整覆盖 0–20 | 147 / 147 |
| 有精炼效果文本 | 147 / 147 |
| 效果文本完整覆盖 0–5 | 147 / 147 |
| 严格编译无条件常驻效果 | 5 / 147（30 个精炼等级） |
| 当前客户端实测 | 0 / 147 |

这些数字来自生成后的 `data/game-data.public.json`，其上游为 `raw/public-web/SRC-004/` 快照与 `corpus/compiled/public-catalogs.json`。完整不等于当前国服适用；数据包仍标记 `public_catalog_compiled_not_client_validated`。

## 已实现行为

- 公共包：`levelCurve[level].values` 表示强化静态属性；`effectLevels[refinement]` 保存完整技能文本；`staticEffectLevels[refinement]` 只保存严格白名单解析出的无条件常驻面板属性。
- 账号包：新记录输出 schema `0.2.0`，保存强化等级、精炼阶数及可选 `observedStats`。
- OCR finalize：保留归一化属性、原始文字和置信度，不再把公共属性复制成账号事实。
- 求解器：无观测值时使用公共等级曲线；有观测值时覆盖，并报告与曲线的字段差异；随后按精炼等级叠加已编译常驻效果并保留未客户端验证警告。
- 条件效果：不把原始 `effectLevels` 或旧 `effectStats` 直接加入常驻面板。当前只有先祖之骨、冥想者烟斗、Rift Hourglass、Troll's Heart、Dancing Gyro 的完整无条件单句可执行；142 件仍为文本。
- 回归：已覆盖公共 +20 曲线、账号观测覆盖、差异警告、OCR/canonical 一致及 exhaustive/branch-and-bound Top-N 一致。

## 风险与下一步

最大的剩余风险不是字段结构，而是版本真实性：没有真实客户端或截图，不能确认目标渠道的名称、等级上限、数值以及这 5 个效果是否进入同一面板层。取得 golden screenshots 后，应逐稀有度抽样核对 0、关键中间等级和 20 级属性，并让采集布局同时识别 `level` 与 `refinement`；再用穿戴前后面板校验常驻效果。任何客户端冲突都应进入新的版本数据包，而不是覆盖当前快照。
