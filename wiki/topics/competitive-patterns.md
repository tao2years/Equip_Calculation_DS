# 同类工具模式

## 结论

不建议复制某一个网站的全部功能。适合本项目的组合是：痒痒鼠魔方的“账号资产 → 配装场景”心智模型、Fribbels 的约束与保留当前装备、Genshin Optimizer 的标准交换格式和目标/约束分离、Inventory Kamera/GOODScanner 的 OCR + 规则校验。

## 对比

| 产品/项目 | 可借鉴点 | 不直接照搬的部分 |
|---|---|---|
| 痒痒鼠魔方 `yyshub.top` | 账号资产、角色选择、固定/筛选、给出多套结果的整体心智模型 | 页面未能从后台抓取到可读结构，本阶段未核验其实际数据接入和算法，不能据外观推断实现 |
| Fribbels E7 Optimizer | 自动/文件导入、英雄与装备合并更新、`Keep current`、主副词条/套装过滤、Top% 缩小搜索 | 其网络扫描路径针对另一款游戏，不能证明龙息可安全复用 |
| Genshin Optimizer | 标准 GOOD 交换格式、扫描器和优化器解耦、目标与最低约束分离、多目标权重、结果实时比较 | 完整战斗模型复杂度过高，不应进入首个 MVP |
| Inventory Kamera / GOODScanner | 用户可见 UI 截图 OCR、词典和 roll 合法性校验、可中止、调试截图 | 自动键鼠导航仍需龙息条款与 UI 稳定性验证；首轮先支持截图文件导入 |
| Summoners War Optimizer | 最低/最高属性、只用背包或允许拆装、broken set、按结果列排序 | 抓包/代理式导入的账号风险不应照搬 |

## 产品原则

1. **先导入、后修复、再计算**：错误字段必须在 staging 中解决，不让求解器猜。
2. **目标与约束分开**：例如“暴击至少 100%”是约束，“最大攻击×爆伤”是目标。
3. **锁定是一级功能**：固定神器、保留当前装备、排除珍贵装备都应在运行前可见。
4. **结果可比较**：Top N 不是只报一个分数，而是显示相对当前方案的差值与代价。
5. **标准格式先行**：扫描器、手工编辑器、网页/桌面 UI 和求解器通过稳定 JSON schema 解耦。
6. **模板降低门槛**：预置重击输出、精通输出、坦克、命中辅助，同时保留高级自定义。

## 参考

- https://yyshub.top/
- https://github.com/fribbels/Fribbels-Epic-7-Optimizer
- https://github.com/frzyc/genshin-optimizer
- https://github.com/Andrewthe13th/Inventory_Kamera
- https://github.com/BigOrange666/GOODScanner
