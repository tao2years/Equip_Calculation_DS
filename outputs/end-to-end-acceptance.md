# 端到端交付验收

生成证据时间：2026-11-03T10:14:26.753Z

状态：**passed**

证据等级：`synthetic_fixture_with_public_catalog`

## 覆盖

- 公共定义：351 角色、682 装备、147 神器、252 套装定义。
- 可执行静态套装：148。
- 账号 fixture：2 角色、12 装备、3 神器。
- 求解：64 个组合，1 个满足约束，模式 `exhaustive`。

## 验收门

| 检查 | 状态 | 证据 |
|---|---|---|
| `html_inventory_import_contract` | passed | AccountSnapshot passes the same editable-inventory validator used by the HTML workflow. |
| `public_artifact_level_curve` | passed | Public artifact-eyeball-of-the-giant +6 resolves 2 static stat fields. |
| `shared_optimizer_execution` | passed | 64 builds searched; 1 valid; 1 returned. |
| `top_result_constraints` | passed | Top result satisfies every explicit and objective-implied sheet constraint. |
| `seven_slot_build` | passed | Result must contain one artifact plus exactly one item in each of the six gear slots. |
| `artifact_static_stats` | passed | Artifact stat source: account_observed. |
| `public_definition_coverage` | passed | 351 heroes, 682 equipment, 147 artifacts, 148 executable set definitions. |

## 结论边界

本报告证明公共数据、HTML 库存校验契约、账号文件、版本化请求和共享求解核心可以端到端互操作。账号仍是合成 fixture；它不证明真实客户端 OCR、全账号完整性或游戏公式正确。
