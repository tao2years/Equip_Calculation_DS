# 神器等级、精炼与属性来源

更新：2026-11-03

## 结论

神器有两条独立成长轴，不能共用一个 `refinement` 字段：

- `level`：0–20 强化等级，决定神器常驻面板属性；
- `refinement`：0–5 精炼阶数，决定神器技能文本中的效果数值。

当前公共包的 147/147 件神器都有完整 0–20 `levelCurve`，也都有 0–5 `effectLevels`。严格完整句白名单从中识别出 5 件神器、30 个精炼等级的无条件常驻面板效果，输出到 `staticEffectLevels`；其余 142 件保持文本态。来源是 `SRC-004` 的不可变网页快照及编译记录，证据等级为公共文本解析且未经过客户端验证。

## 计算优先级

`resolveArtifactStats()` 按以下顺序解析静态面板属性：

1. `AccountSnapshot.ownedArtifacts[].observedStats`：OCR/人工从神器详情直接观测的静态属性，不含效果文本；
2. 旧版 `stats`：仅用于兼容 0.1 快照；
3. `GameData.artifacts[].levelCurve[level]`：没有账号观测时使用公共强化曲线；
4. `GameData.artifacts[].staticEffectLevels[refinement]`：只叠加完整、无条件、白名单面板属性句；
5. 都不可用时返回空属性与显式警告。

账号观测和公共曲线不一致时，计算采用账号观测值，同时在结果的 `artifactStatWarnings` 中列出差异；不修改公共原始证据。已编译的常驻精炼效果在账号观测或公共曲线之后单独叠加并给出未验证警告。完整效果文本始终保留；角色限制、技能触发、概率、持续时间、附近单位、目标条件或战斗时序等效果不会进入常驻面板。

## 数据边界

- 公共定义保存名称、稀有度、两条成长轴、效果文本和来源；
- 账号快照只保存拥有关系、`level`、`refinement`、锁定/穿戴状态及可选观测证据；
- 求解结果保存 `artifactStatSource` 与警告，便于复算和 Review；
- 旧版 `effectStats` 是实验字段，不进入面板求和。

机器审计位于 `corpus/compiled/artifact-static-effect-audit.json`，人类可读视图位于 `outputs/artifact-static-effect-audit.md`。解析器要求 0–5 每个精炼等级全部通过；任一级失败则整件神器保持文本态，防止只解析最方便的一档。

## 待验证

- 当前国服 build 是否仍使用同一 0–20 数值曲线；
- UI 对“精炼”的中文显示、阶数起点和满阶表达；
- OCR 页面能否稳定同时读取强化等级、精炼阶数与两条静态属性；
- 条件效果何时可安全结构化为场景模型，而不是面板常量。
