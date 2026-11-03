# 神器等级、精炼与属性来源

更新：2026-11-03

## 结论

神器有两条独立成长轴，不能共用一个 `refinement` 字段：

- `level`：0–20 强化等级，决定神器常驻面板属性；
- `refinement`：0–5 精炼阶数，决定神器技能文本中的效果数值。

当前公共包的 147/147 件神器都有完整 0–20 `levelCurve`，也都有 0–5 `effectLevels`。来源是 `SRC-004` 的不可变网页快照及编译记录，证据等级为 `public_catalog_compiled_not_client_validated`；尚未在当前国服客户端逐件核对。

## 计算优先级

`resolveArtifactStats()` 按以下顺序解析静态面板属性：

1. `AccountSnapshot.ownedArtifacts[].observedStats`：OCR/人工从账号画面直接观测；
2. 旧版 `stats`：仅用于兼容 0.1 快照；
3. `GameData.artifacts[].levelCurve[level]`：没有账号观测时使用公共曲线；
4. 都不可用时返回空属性与显式警告。

账号观测和公共曲线不一致时，计算采用账号观测值，同时在结果的 `artifactStatWarnings` 中列出差异；不修改公共原始证据。`effectLevels` 仍是文本证据，不自动加到常驻面板，因为许多效果带角色限制、技能触发、目标条件或战斗时序。

## 数据边界

- 公共定义保存名称、稀有度、两条成长轴、效果文本和来源；
- 账号快照只保存拥有关系、`level`、`refinement`、锁定/穿戴状态及可选观测证据；
- 求解结果保存 `artifactStatSource` 与警告，便于复算和 Review；
- 旧版 `effectStats` 是实验字段，不进入面板求和。

## 待验证

- 当前国服 build 是否仍使用同一 0–20 数值曲线；
- UI 对“精炼”的中文显示、阶数起点和满阶表达；
- OCR 页面能否稳定同时读取强化等级、精炼阶数与两条静态属性；
- 条件效果何时可安全结构化为场景模型，而不是面板常量。
