# 神器常驻效果编译审计

生成时间：2026-11-03T10:14:26.753Z

## 执行摘要

- 公共目录包含 **147** 个神器，147 个具有 0–5 精炼效果文本。
- 严格完整句白名单编译 **5** 个神器、30 个精炼等级。
- 其余 142 个保留文本，不进入常驻面板。
- 所有结果仍是公共网页文本解析，未经目标客户端验证。

## 已编译神器

- **Rift Hourglass**（artifact-400007）：精炼 0 = skill_haste:50；精炼 1 = skill_haste:60；精炼 2 = skill_haste:70；精炼 3 = skill_haste:80；精炼 4 = skill_haste:90；精炼 5 = skill_haste:100
- **Troll's Heart**（artifact-200008）：精炼 0 = hp_pct:0.1；精炼 1 = hp_pct:0.12；精炼 2 = hp_pct:0.14；精炼 3 = hp_pct:0.16；精炼 4 = hp_pct:0.18；精炼 5 = hp_pct:0.2
- **Dancing Gyro**（artifact-200005）：精炼 0 = attack_speed_pct:0.15；精炼 1 = attack_speed_pct:0.17；精炼 2 = attack_speed_pct:0.19；精炼 3 = attack_speed_pct:0.21；精炼 4 = attack_speed_pct:0.23；精炼 5 = attack_speed_pct:0.25
- **冥想者烟斗**（artifact-meditator-pipe）：精炼 0 = enlightenment:20；精炼 1 = enlightenment:23；精炼 2 = enlightenment:26；精炼 3 = enlightenment:29；精炼 4 = enlightenment:32；精炼 5 = enlightenment:35
- **先祖之骨**（artifact-ancestor-bone）：精炼 0 = crit_damage:0.15；精炼 1 = crit_damage:0.17；精炼 2 = crit_damage:0.19；精炼 3 = crit_damage:0.21；精炼 4 = crit_damage:0.23；精炼 5 = crit_damage:0.25

## 使用边界

只有“The wearer obtains/gains 数值 extra 白名单属性.”这一类完整、无条件单句可以执行。任一精炼等级不匹配时整件神器保持文本态；触发、持续时间、概率、附近单位、角色限定、战斗阶段和伤害类效果一律不推断。
