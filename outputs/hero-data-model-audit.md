# 公共角色数据模型审计

生成时间：2026-11-03T10:14:26.753Z

## 执行摘要

- 公共目录包含 **351** 个角色对象，351 个具有完整的十项基础字段。
- 2 个角色有独立详情页快照交叉校验，失败 0 个；其余记录仍是单一目录来源。
- 1 个对象触发稳健分布复核标记；求解器要求这些对象提供账号观测基础属性。
- 137 个对象的公开成长字段包含比例属性。该字段含义未由客户端验证，不能静默当作逐角色等级成长。

## 独立交叉校验

- **埃里奇**（hero-20400）：passed；hp_flat Δ=-0.4，def_flat Δ=0，atk_flat Δ=-0.2，enlightenment Δ=0，crit_rate Δ=0，crit_damage Δ=0，accuracy Δ=0，resistance Δ=0，skill_haste Δ=0；证据 SRC-017 / 05b673bfb5e245270a01215d9f6a8f220428524995c9d1e5b99e2bd18727c9c1
- **阿斯切提乌斯**（hero-21760）：passed；hp_flat Δ=0，def_flat Δ=0，atk_flat Δ=-0.2，enlightenment Δ=0，crit_rate Δ=0，crit_damage Δ=0，accuracy Δ=0，resistance Δ=0，skill_haste Δ=0；证据 SRC-006 / b7d5d588ceda99d81f63857d1f760a4d1fbef25cff25ae685f9758877d5dd371

## 异常候选

- **Child of Chaos**（hero-10002 / 10002）：robust_upper_outlier:hp_flat，robust_upper_outlier:atk_flat

## 结论与使用边界

目录覆盖不等于客户端正确性。一级角色只有在未触发异常标记时才可作为公共候选值；异常对象及所有高等级角色默认要求账号截图提供 `baseStatsOverride`。比例成长字段继续保留作研究证据，但不默认参与高等级推算。
