# 账号资产证据追溯

## 为什么需要

账号采集的数值最终会影响配装结果。只保存“攻击 235”而不保存它来自哪张截图，会导致 OCR 错误、人工修订和重复装备问题无法复核。因此截图采集输出必须形成从原图到最终方案的连续引用链。

## 已实现链路

```text
原始 PNG + SHA-256
  → recognition image（序号、页面类型、Review 状态）
  → OcrStaging record.evidenceRefs[] + fieldEvidence[]
  → AccountSnapshot owned*.evidenceRefs[] + fieldEvidence[]
  → OptimizationResult 0.3 results[].evidence
```

每个 `evidenceRef` 保存原始文件 SHA-256、本地相对名称、采集序号、页面类型和 Review 状态。每个 `fieldEvidence` 另保存字段路径、OCR 原文、置信度和一个或多个像素坐标矩形；统计行的标签和值分别建立证据。公共 definition 仍通过稳定 ID 引用，不复制到账号事实中。

## 验证规则

- `screenshot_ocr` 账号中的每个角色、装备和神器必须至少有一个证据引用。
- 每条截图资产还必须有字段级证据；字段证据的截图哈希同样必须存在于顶层 `sourceFiles`。
- 引用 SHA-256 必须存在于快照顶层 `sourceFiles`，不能指向丢失或被替换的图片。
- layout extractor 按 profile 区域生成字段路径与矩形，staging Review 改变记录类型时保留证据，finalizer 不得丢弃。
- 优化结果保存所选神器和六件装备各自的记录引用与字段证据，便于从推荐方案回到具体原文和坐标。
- 手工或合成账号可以没有截图引用，但不能伪装成 `screenshot_ocr`。

## 当前边界

字段坐标链已在合成 1000×1000 profile 上验证，但坐标准确性仍取决于真实渠道/build 的 layout profile。HTML 当前显示每条资产的截图数和字段框数；点击字段直接打开原图并高亮矩形尚未实现。真实客户端校准仍需验证 DPI、缩放、裁切和多行文本。
