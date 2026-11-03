#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const account = JSON.parse(await readFile(path.join(ROOT, "examples", "account-snapshot.example.json"), "utf8"));
const gameData = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8"));
const STAT_LABELS = {
  hp_flat: "生命", hp_pct: "生命%", atk_flat: "攻击", atk_pct: "攻击%", def_flat: "防御", def_pct: "防御%",
  crit_rate: "重击率", crit_damage: "重击伤害", accuracy: "效果命中", resistance: "效果抵抗",
  enlightenment: "精通", skill_haste: "技能急速", attack_speed_pct: "攻击速度"
};
const SLOT_LABELS = { helmet: "头盔", weapon: "武器", chest: "胸甲", gloves: "手套", positive_rune: "正位符文", negative_rune: "负位符文" };
const ARTIFACT_LABELS = { "artifact-eyeball-of-the-giant": "巨人眼球" };

function observations(stats) {
  return Object.entries(stats || {}).map(([key, value]) => ({
    label: STAT_LABELS[key] || key,
    value: key.endsWith("_pct") || ["crit_rate", "crit_damage", "attack_speed_pct"].includes(key) ? `${value * 100}%` : String(value),
    confidence: 0.99
  }));
}

const records = [];
const fixtureSha256 = createHash("sha256").update("synthetic-ocr-staging-fixture").digest("hex");
const syntheticEvidenceRefs = [{ sourceFileSha256: fixtureSha256, localName: "synthetic-fixture", sequence: null, captureType: null, reviewStatus: "synthetic_fixture" }];
function syntheticFieldEvidence(fields) {
  const evidence = [];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        evidence.push({ fieldPath: `${key}[${index}].label`, sourceFileSha256: fixtureSha256, rawText: String(entry.label), confidence: entry.confidence, boundingRects: [] });
        evidence.push({ fieldPath: `${key}[${index}].value`, sourceFileSha256: fixtureSha256, rawText: String(entry.value), confidence: entry.confidence, boundingRects: [] });
      });
    } else if (value != null) {
      evidence.push({ fieldPath: key, sourceFileSha256: fixtureSha256, rawText: String(value), confidence: 0.99, boundingRects: [] });
    }
  }
  return evidence;
}
for (const hero of account.ownedHeroes) {
  const definition = gameData.heroes.find((entry) => entry.id === hero.heroDefinitionId);
  const fields = { name: definition.names.en, level: String(hero.level), stars: String(hero.stars), inspiration: String(hero.inspiration), baseStats: [] };
  records.push({ kind: "hero", sourceRecordId: hero.ownedHeroId, confidence: 0.99, evidenceRefs: syntheticEvidenceRefs, fieldEvidence: syntheticFieldEvidence(fields), fields });
}
for (const artifact of account.ownedArtifacts) {
  const definition = gameData.artifacts.find((entry) => entry.id === artifact.artifactDefinitionId);
  const artifactStats = artifact.stats || Object.fromEntries((artifact.observedStats || []).map((entry) => [entry.stat, entry.value]));
  const fields = { name: ARTIFACT_LABELS[artifact.artifactDefinitionId] || definition.names.en, level: `+${artifact.level}`, refinement: `+${artifact.refinement}`, locked: artifact.locked, equippedBy: artifact.equippedBy, stats: observations(artifactStats) };
  records.push({ kind: "artifact", sourceRecordId: artifact.ownedArtifactId, confidence: 0.99, evidenceRefs: syntheticEvidenceRefs, fieldEvidence: syntheticFieldEvidence(fields), fields });
}
for (const item of account.ownedGear) {
  const fields = { slot: SLOT_LABELS[item.slot], setId: item.setId, enhanceLevel: `+${item.enhanceLevel}`, locked: item.locked, equippedBy: item.equippedBy, stats: observations(item.stats) };
  records.push({ kind: "gear", sourceRecordId: item.ownedItemId, confidence: 0.99, evidenceRefs: syntheticEvidenceRefs, fieldEvidence: syntheticFieldEvidence(fields), fields });
}

const staging = {
  schemaVersion: "0.1.0",
  jobId: "example-ocr-job-001",
  createdAt: "2026-11-03T12:00:00+08:00",
  gameDataVersionId: gameData.dataVersion.id,
  sourceFiles: [{ sha256: fixtureSha256, mediaType: "application/x-synthetic-fixture", localName: "synthetic-fixture" }],
  records
};
await writeFile(path.join(ROOT, "examples", "ocr-staging.example.json"), `${JSON.stringify(staging, null, 2)}\n`);
console.log(`built OCR staging fixture with ${records.length} records`);
