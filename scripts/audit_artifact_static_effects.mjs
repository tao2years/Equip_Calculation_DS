#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARTIFACT_STATIC_EFFECT_PARSER_VERSION } from "./lib/parse-artifact-static-effect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameData = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8"));
const compiled = gameData.artifacts.filter((artifact) => artifact.staticEffectLevels?.length).map((artifact) => ({
  artifactDefinitionId: artifact.id,
  name: artifact.names.zh || artifact.names.en,
  refinementLevels: artifact.staticEffectLevels,
  source: artifact.source
}));
const report = {
  schemaVersion: "0.1.0",
  generatedAt: gameData.dataVersion.retrievedAt,
  gameDataVersionId: gameData.dataVersion.id,
  parserVersion: ARTIFACT_STATIC_EFFECT_PARSER_VERSION,
  evidenceLevel: "public_effect_text_parsed_not_client_validated",
  counts: {
    totalArtifacts: gameData.artifacts.length,
    artifactsWithEffectText: gameData.artifacts.filter((artifact) => artifact.effectLevels?.length).length,
    compiledStaticArtifacts: compiled.length,
    compiledRefinementLevels: compiled.reduce((total, artifact) => total + artifact.refinementLevels.length, 0),
    retainedAsTextOnly: gameData.artifacts.length - compiled.length
  },
  compiledArtifacts: compiled,
  limitations: [
    "Only a complete single sentence matching the unconditional wearer stat whitelist is compiled.",
    "Every refinement rank must parse successfully or the artifact remains text-only.",
    "Conditional, timed, chance-based, target-dependent, hero-specific and encounter effects are not added to sheet stats.",
    "No compiled effect has been validated against the target live client."
  ]
};

const jsonPath = path.join(ROOT, "corpus", "compiled", "artifact-static-effect-audit.json");
const markdownPath = path.join(ROOT, "outputs", "artifact-static-effect-audit.md");
const markdown = `# 神器常驻效果编译审计\n\n` +
  `生成时间：${report.generatedAt}\n\n` +
  `## 执行摘要\n\n` +
  `- 公共目录包含 **${report.counts.totalArtifacts}** 个神器，${report.counts.artifactsWithEffectText} 个具有 0–5 精炼效果文本。\n` +
  `- 严格完整句白名单编译 **${report.counts.compiledStaticArtifacts}** 个神器、${report.counts.compiledRefinementLevels} 个精炼等级。\n` +
  `- 其余 ${report.counts.retainedAsTextOnly} 个保留文本，不进入常驻面板。\n` +
  `- 所有结果仍是公共网页文本解析，未经目标客户端验证。\n\n` +
  `## 已编译神器\n\n` +
  compiled.map((artifact) => `- **${artifact.name}**（${artifact.artifactDefinitionId}）：${artifact.refinementLevels.map((level) => `精炼 ${level.refinement} = ${Object.entries(level.values).map(([stat, value]) => `${stat}:${value}`).join(",")}`).join("；")}`).join("\n") +
  `\n\n## 使用边界\n\n` +
  `只有“The wearer obtains/gains 数值 extra 白名单属性.”这一类完整、无条件单句可以执行。任一精炼等级不匹配时整件神器保持文本态；触发、持续时间、概率、附近单位、角色限定、战斗阶段和伤害类效果一律不推断。\n`;

await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, markdown, "utf8");
console.log(JSON.stringify({ jsonPath: path.relative(ROOT, jsonPath), markdownPath: path.relative(ROOT, markdownPath), counts: report.counts }, null, 2));
