# 账号资产证据追溯

## 为什么需要

账号采集的数值最终会影响配装结果。只保存“攻击 235”而不保存它来自哪张截图，会导致 OCR 错误、人工修订和重复装备问题无法复核。因此截图采集输出必须形成从原图到最终方案的连续引用链。

## 已实现链路

```text
原始 PNG + SHA-256
  → recognition image（序号、页面类型、Review 状态）
  → OcrStaging record.evidenceRefs[]
  → AccountSnapshot owned*.evidenceRefs[]
  → OptimizationResult results[].evidence
```

每个 `evidenceRef` 保存：原始文件 SHA-256、本地相对名称、采集序号、页面类型和 Review 状态。属性观测另保存原始文字与置信度；公共 definition 仍通过稳定 ID 引用，不复制到账号事实中。

## 验证规则

- `screenshot_ocr` 账号中的每个角色、装备和神器必须至少有一个证据引用。
- 引用 SHA-256 必须存在于快照顶层 `sourceFiles`，不能指向丢失或被替换的图片。
- layout extractor 生成引用，staging Review 改变记录类型时保留引用，finalizer 不得丢弃。
- 优化结果保存所选神器和六件装备各自的引用，便于从推荐方案回看原图。
- 手工或合成账号可以没有截图引用，但不能伪装成 `screenshot_ocr`。

## 尚未完成

当前引用粒度是“资产记录 → 原图”；属性观测保留原文和置信度，但尚未把每个字段绑定到精确 OCR bounding box。真实客户端校准后应把行号/矩形加入字段级 evidence，并在 HTML 中提供点击回看原图高亮。
