#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeHeroDataQuality, HERO_BASE_STAT_KEYS } from "./lib/hero-data-quality.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameData = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8"));
const details = JSON.parse(await readFile(path.join(ROOT, "corpus", "compiled", "heroes.public.json"), "utf8"));
const analysis = analyzeHeroDataQuality(gameData.heroes, details.heroes);
const records = analysis.records;
const report = {
  schemaVersion: "0.1.0",
  generatedAt: gameData.dataVersion.retrievedAt,
  gameDataVersionId: gameData.dataVersion.id,
  evidenceLevel: "public_catalog_audit_not_client_validated",
  requiredBaseStats: HERO_BASE_STAT_KEYS,
  counts: {
    totalHeroes: records.length,
    completeBaseStats: records.filter((record) => !record.anomalyFlags.some((flag) => flag.startsWith("missing_or_non_numeric:"))).length,
    withSkills: gameData.heroes.filter((hero) => hero.skills?.length).length,
    independentlyCrosschecked: records.filter((record) => record.evidenceStatus === "independent_detail_crosschecked").length,
    crosscheckFailed: records.filter((record) => record.crosscheck?.status === "failed").length,
    anomalyCandidates: records.filter((record) => record.anomalyFlags.length).length,
    withNonzeroRatioGrowth: records.filter((record) => record.ratioGrowthStats.length).length
  },
  distributions: analysis.distributions,
  crosschecks: records.filter((record) => record.crosscheck).map((record) => ({ heroDefinitionId: record.heroDefinitionId, name: record.name, ...record.crosscheck })),
  anomalyCandidates: records.filter((record) => record.anomalyFlags.length).map((record) => ({ heroDefinitionId: record.heroDefinitionId, externalId: record.externalId, name: record.name, flags: record.anomalyFlags })),
  ratioGrowthRisk: {
    affectedHeroCount: records.filter((record) => record.ratioGrowthStats.length).length,
    affectedStats: [...new Set(records.flatMap((record) => record.ratioGrowthStats))].sort(),
    interpretation: "The public field is preserved but is not assumed to be a literal per-character-level increment. Level > 1 requires account-observed baseStatsOverride by default."
  },
  limitations: [
    "All 351 catalog records are compiled from one public catalog snapshot that can mix seasons, regions or special forms.",
    "Only two heroes have independent detail-page snapshots in the local corpus.",
    "Distribution flags are review candidates, not proof that the public record is wrong.",
    "No hero base-stat record has been validated against the target live client."
  ]
};

const jsonPath = path.join(ROOT, "corpus", "compiled", "hero-data-model-audit.json");
const markdownPath = path.join(ROOT, "outputs", "hero-data-model-audit.md");
const markdown = `# 公共角色数据模型审计\n\n` +
  `生成时间：${report.generatedAt}\n\n` +
  `## 执行摘要\n\n` +
  `- 公共目录包含 **${report.counts.totalHeroes}** 个角色对象，${report.counts.completeBaseStats} 个具有完整的十项基础字段。\n` +
  `- ${report.counts.independentlyCrosschecked} 个角色有独立详情页快照交叉校验，失败 ${report.counts.crosscheckFailed} 个；其余记录仍是单一目录来源。\n` +
  `- ${report.counts.anomalyCandidates} 个对象触发稳健分布复核标记；求解器要求这些对象提供账号观测基础属性。\n` +
  `- ${report.counts.withNonzeroRatioGrowth} 个对象的公开成长字段包含比例属性。该字段含义未由客户端验证，不能静默当作逐角色等级成长。\n\n` +
  `## 独立交叉校验\n\n` +
  report.crosschecks.map((entry) => `- **${entry.name}**（${entry.heroDefinitionId}）：${entry.status}；${entry.comparisons.map((field) => `${field.stat} Δ=${field.delta}`).join("，")}；证据 ${entry.sourceId} / ${entry.snapshotSha256}`).join("\n") +
  `\n\n## 异常候选\n\n` +
  (report.anomalyCandidates.length ? report.anomalyCandidates.map((entry) => `- **${entry.name}**（${entry.heroDefinitionId} / ${entry.externalId}）：${entry.flags.join("，")}`).join("\n") : "- 无") +
  `\n\n## 结论与使用边界\n\n` +
  `目录覆盖不等于客户端正确性。一级角色只有在未触发异常标记时才可作为公共候选值；异常对象及所有高等级角色默认要求账号截图提供 \`baseStatsOverride\`。比例成长字段继续保留作研究证据，但不默认参与高等级推算。\n`;

await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, markdown, "utf8");
console.log(JSON.stringify({ jsonPath: path.relative(ROOT, jsonPath), markdownPath: path.relative(ROOT, markdownPath), counts: report.counts }, null, 2));
