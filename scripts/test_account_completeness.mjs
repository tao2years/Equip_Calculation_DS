#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAccountCompleteness } from "../collectors/lib/audit-account.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [snapshot, reference, gameData] = await Promise.all([
  readFile(path.join(ROOT, "examples", "account-snapshot.example.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "examples", "account-completeness-reference.example.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8").then(JSON.parse)
]);

const passing = auditAccountCompleteness(snapshot, reference, gameData);
assert.equal(passing.status, "passed");
assert.deepEqual(passing.errors, []);
assert.equal(passing.countChecks.gear.match, true);
assert.equal(passing.gearSlotChecks.helmet.match, true);

const missingGear = structuredClone(snapshot);
missingGear.ownedGear.pop();
const failing = auditAccountCompleteness(missingGear, reference, gameData);
assert.equal(failing.status, "failed");
assert.ok(failing.errors.some((entry) => entry.includes("gear count expected 12, got 11")));
assert.ok(failing.errors.some((entry) => entry.includes("negative_rune expected 2, got 1")));

const duplicateHero = structuredClone(snapshot);
duplicateHero.ownedHeroes.push({ ...duplicateHero.ownedHeroes[0], ownedHeroId: "duplicate-owned-hero" });
const duplicateReport = auditAccountCompleteness(duplicateHero, reference, gameData);
assert.equal(duplicateReport.status, "failed");
assert.deepEqual(duplicateReport.duplicateDefinitions.heroes, ["hero-21760"]);

console.log("Account completeness tests passed: exact reference match, missing gear/slot detection, and duplicate hero detection");
