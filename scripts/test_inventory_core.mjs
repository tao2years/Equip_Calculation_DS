#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptySnapshot, diffAccountSnapshots, mergeAccountSnapshots, nextOwnedId, parseStats, snapshotCounts, validateEditableSnapshot } from "../prototype/inventory-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameData = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8"));
const snapshot = createEmptySnapshot(gameData.dataVersion.id, new Date("2026-11-03T00:00:00Z"));
assert.deepEqual(snapshotCounts(snapshot), { heroes: 0, gear: 0, artifacts: 0 });
assert.deepEqual(parseStats("atk_flat=235, crit_rate=20%\naccuracy: 15", gameData.statDefinitions.map((entry) => entry.id)), { atk_flat: 235, crit_rate: 0.2, accuracy: 15 });
assert.throws(() => parseStats("crit_rate=20%, crit_rate=10%"), /重复/);
assert.throws(() => parseStats("made_up=1", gameData.statDefinitions.map((entry) => entry.id)), /未知属性/);
assert.equal(nextOwnedId("gear-manual", [{ ownedItemId: "gear-manual-002" }], "ownedItemId"), "gear-manual-003");

snapshot.ownedHeroes.push({ ownedHeroId: "hero-manual-001", heroDefinitionId: gameData.heroes[0].id, level: 1, stars: 1, inspiration: 0 });
snapshot.ownedGear.push({ ownedItemId: "gear-manual-001", slot: "helmet", setId: null, enhanceLevel: 0, stats: { hp_flat: 100 }, locked: false });
snapshot.ownedArtifacts.push({ ownedArtifactId: "artifact-manual-001", artifactDefinitionId: gameData.artifacts[0].id, level: 20, refinement: 0, observedStats: [{ stat: "hp_pct", value: 0.1, raw_text: null, confidence: 1 }], locked: false });
assert.deepEqual(validateEditableSnapshot(snapshot, gameData), { errors: [], warnings: [] });
snapshot.ownedHeroes[0].level = 2;
assert.match(validateEditableSnapshot(snapshot, gameData).errors.join(";"), /缺少账号观测基础属性/);
snapshot.ownedHeroes[0].baseStatsOverride = { hp_flat: 1000, atk_flat: 100, def_flat: 50 };
assert.deepEqual(validateEditableSnapshot(snapshot, gameData), { errors: [], warnings: [] });
snapshot.ownedHeroes[0].level = 1;
delete snapshot.ownedHeroes[0].baseStatsOverride;
const linkedDefinition = gameData.equipment.find((entry) => entry.slot === "helmet");
snapshot.ownedGear[0].definitionId = linkedDefinition.id;
snapshot.ownedGear[0].setId = linkedDefinition.setId;
assert.deepEqual(validateEditableSnapshot(snapshot, gameData), { errors: [], warnings: [] });
snapshot.ownedGear[0].slot = "weapon";
assert.match(validateEditableSnapshot(snapshot, gameData).errors.join(";"), /槽位与公共定义冲突/);
snapshot.ownedGear[0].slot = "helmet";
snapshot.ownedGear.push({ ...snapshot.ownedGear[0] });
assert.match(validateEditableSnapshot(snapshot, gameData).errors.join(";"), /重复/);
snapshot.ownedGear.pop();

const incoming = structuredClone(snapshot);
incoming.snapshotId = "incoming-snapshot";
incoming.ownedHeroes[0].level = 2;
incoming.ownedGear = [];
incoming.ownedArtifacts.push({ ownedArtifactId: "artifact-manual-002", artifactDefinitionId: gameData.artifacts[1].id, level: 20, refinement: 0, observedStats: [], locked: false });
const diff = diffAccountSnapshots(snapshot, incoming);
assert.deepEqual(diff.totals.heroes, { added: 0, updated: 1, unchanged: 0, missingFromIncoming: 0 });
assert.deepEqual(diff.totals.gear, { added: 0, updated: 0, unchanged: 0, missingFromIncoming: 1 });
assert.deepEqual(diff.totals.artifacts, { added: 1, updated: 0, unchanged: 1, missingFromIncoming: 0 });
const merged = mergeAccountSnapshots(snapshot, incoming, { now: new Date("2026-11-03T01:00:00Z") });
assert.equal(merged.snapshot.sourceMethod, "mixed");
assert.equal(merged.snapshot.ownedHeroes[0].level, 2);
assert.equal(merged.snapshot.ownedGear.length, 1, "missing records are preserved by default");
assert.equal(merged.snapshot.ownedArtifacts.length, 2);
assert.throws(() => mergeAccountSnapshots(snapshot, { ...incoming, gameDataVersionId: "other-version" }), /不同公共数据版本/);
console.log("Inventory editor core tests passed: parsing, IDs, validation, snapshot diff and merge");
