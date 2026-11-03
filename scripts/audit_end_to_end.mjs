#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { snapshotCounts, validateEditableSnapshot } from "../prototype/inventory-core.mjs";
import { executeOptimizationRequest } from "../prototype/optimization-request-core.mjs";
import { resolveArtifactStats } from "../prototype/optimizer-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function constraintPass(actual, constraint) {
  if (constraint.op === ">=") return actual >= constraint.value;
  if (constraint.op === ">") return actual > constraint.value;
  if (constraint.op === "<=") return actual <= constraint.value;
  if (constraint.op === "<") return actual < constraint.value;
  return Math.abs(actual - constraint.value) <= 1e-9;
}

const paths = {
  account: path.resolve(option("account", path.join(ROOT, "examples", "account-snapshot.example.json"))),
  request: path.resolve(option("request", path.join(ROOT, "examples", "optimization-request.example.json"))),
  gameData: path.resolve(option("game-data", path.join(ROOT, "data", "game-data.public.json"))),
  json: path.resolve(option("json", path.join(ROOT, "outputs", "end-to-end-acceptance.json"))),
  markdown: path.resolve(option("markdown", path.join(ROOT, "outputs", "end-to-end-acceptance.md")))
};

const [accountBytes, requestBytes, gameDataBytes] = await Promise.all([
  readFile(paths.account),
  readFile(paths.request),
  readFile(paths.gameData)
]);
const account = JSON.parse(accountBytes);
const request = JSON.parse(requestBytes);
const gameData = JSON.parse(gameDataBytes);
const validation = validateEditableSnapshot(account, gameData);
const checks = [];
checks.push({
  id: "html_inventory_import_contract",
  status: validation.errors.length ? "failed" : "passed",
  detail: validation.errors.length ? validation.errors.join("; ") : "AccountSnapshot passes the same editable-inventory validator used by the HTML workflow."
});
const selectedArtifact = account.ownedArtifacts.find((entry) => entry.ownedArtifactId === request.fixedItems?.artifact);
const publicArtifactProbe = selectedArtifact ? resolveArtifactStats(gameData, {
  ownedArtifactId: "public-curve-probe",
  artifactDefinitionId: selectedArtifact.artifactDefinitionId,
  level: selectedArtifact.level,
  refinement: selectedArtifact.refinement,
  locked: false
}) : null;
checks.push({
  id: "public_artifact_level_curve",
  status: publicArtifactProbe?.source === "public_level_curve" && Object.keys(publicArtifactProbe.stats).length ? "passed" : "failed",
  detail: publicArtifactProbe ? `Public ${selectedArtifact.artifactDefinitionId} +${selectedArtifact.level} resolves ${Object.keys(publicArtifactProbe.stats).length} static stat fields.` : "Selected artifact is missing from the account."
});

let optimization = null;
if (!validation.errors.length) {
  try {
    optimization = executeOptimizationRequest({ account, request, gameData });
    checks.push({ id: "shared_optimizer_execution", status: optimization.results.length ? "passed" : "failed", detail: `${optimization.searched} builds searched; ${optimization.validCount} valid; ${optimization.results.length} returned.` });
    const top = optimization.results[0];
    const constraintsPass = top && optimization.appliedConstraints.every((constraint) => constraintPass(top.stats[constraint.stat] ?? 0, constraint));
    checks.push({ id: "top_result_constraints", status: constraintsPass ? "passed" : "failed", detail: constraintsPass ? "Top result satisfies every explicit and objective-implied sheet constraint." : "No top result or at least one applied constraint failed." });
    const gearById = new Map(account.ownedGear.map((entry) => [entry.ownedItemId, entry]));
    const expectedSlots = new Set(["helmet", "weapon", "chest", "gloves", "positive_rune", "negative_rune"]);
    const resultSlots = new Set((top?.ownedGearIds || []).map((id) => gearById.get(id)?.slot).filter(Boolean));
    checks.push({ id: "seven_slot_build", status: top && top.ownedGearIds.length === 6 && resultSlots.size === 6 && [...expectedSlots].every((slot) => resultSlots.has(slot)) ? "passed" : "failed", detail: "Result must contain one artifact plus exactly one item in each of the six gear slots." });
    checks.push({ id: "artifact_static_stats", status: top && top.artifactStatSource !== "unavailable" ? "passed" : "failed", detail: top ? `Artifact stat source: ${top.artifactStatSource}.` : "No result artifact." });
  } catch (error) {
    checks.push({ id: "shared_optimizer_execution", status: "failed", detail: error.message });
  }
}

const coverage = {
  heroes: gameData.heroes.length,
  equipment: (gameData.equipment || []).length,
  artifacts: gameData.artifacts.length,
  setDefinitions: gameData.sets.length,
  setsWithExecutableSheetBonuses: gameData.sets.filter((entry) => entry.bonuses?.length).length
};
checks.push({
  id: "public_definition_coverage",
  status: coverage.heroes && coverage.equipment && coverage.artifacts && coverage.setsWithExecutableSheetBonuses ? "passed" : "failed",
  detail: `${coverage.heroes} heroes, ${coverage.equipment} equipment, ${coverage.artifacts} artifacts, ${coverage.setsWithExecutableSheetBonuses} executable set definitions.`
});

const report = {
  schemaVersion: "0.1.0",
  auditedAt: gameData.dataVersion.retrievedAt,
  evidenceLevel: "synthetic_fixture_with_public_catalog",
  status: checks.every((entry) => entry.status === "passed") ? "passed" : "failed",
  inputs: {
    account: { path: path.relative(ROOT, paths.account), sha256: sha256(accountBytes) },
    request: { path: path.relative(ROOT, paths.request), sha256: sha256(requestBytes) },
    gameData: { path: path.relative(ROOT, paths.gameData), sha256: sha256(gameDataBytes), versionId: gameData.dataVersion.id }
  },
  coverage,
  account: { snapshotId: account.snapshotId, counts: snapshotCounts(account), warnings: validation.warnings },
  optimization: optimization ? {
    requestId: optimization.requestId,
    objective: optimization.objective,
    searched: optimization.searched,
    validCount: optimization.validCount,
    solver: optimization.solver,
    topResult: optimization.results[0] || null
  } : null,
  checks,
  limitations: [
    "The account is a synthetic fixture, not a captured live Dragonheir account.",
    "Passing proves the repository data/import/request/solver contracts interoperate; it does not validate current-client OCR or formulas.",
    "The HTML UI and CLI share these inventory and optimization cores, but rendered browser behavior has separate QA evidence."
  ]
};

const markdown = `# 端到端交付验收

生成证据时间：${report.auditedAt}

状态：**${report.status}**

证据等级：\`${report.evidenceLevel}\`

## 覆盖

- 公共定义：${coverage.heroes} 角色、${coverage.equipment} 装备、${coverage.artifacts} 神器、${coverage.setDefinitions} 套装定义。
- 可执行静态套装：${coverage.setsWithExecutableSheetBonuses}。
- 账号 fixture：${report.account.counts.heroes} 角色、${report.account.counts.gear} 装备、${report.account.counts.artifacts} 神器。
- 求解：${optimization?.searched || 0} 个组合，${optimization?.validCount || 0} 个满足约束，模式 \`${optimization?.solver?.mode || "unavailable"}\`。

## 验收门

| 检查 | 状态 | 证据 |
|---|---|---|
${checks.map((entry) => `| \`${entry.id}\` | ${entry.status} | ${entry.detail} |`).join("\n")}

## 结论边界

本报告证明公共数据、HTML 库存校验契约、账号文件、版本化请求和共享求解核心可以端到端互操作。账号仍是合成 fixture；它不证明真实客户端 OCR、全账号完整性或游戏公式正确。
`;

await Promise.all([
  writeFile(paths.json, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(paths.markdown, markdown)
]);
console.log(JSON.stringify({ status: report.status, json: path.relative(ROOT, paths.json), markdown: path.relative(ROOT, paths.markdown), checks: checks.length }, null, 2));
if (report.status !== "passed") process.exitCode = 2;
