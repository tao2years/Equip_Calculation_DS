#!/usr/bin/env node

import assert from "node:assert/strict";
import { compileArtifactStaticEffectLevels, parseArtifactStaticEffect } from "./lib/parse-artifact-static-effect.mjs";

assert.deepEqual(parseArtifactStaticEffect("The wearer obtains 15% extra Crit Damage.")?.sheetStats, { crit_damage: 0.15 });
assert.deepEqual(parseArtifactStaticEffect("The wearer gains 50.0 extra Skill Haste.")?.sheetStats, { skill_haste: 50 });
assert.deepEqual(parseArtifactStaticEffect("The wearer obtains 10% extra HP.")?.sheetStats, { hp_pct: 0.1 });
assert.deepEqual(parseArtifactStaticEffect("The wearer obtains 15% extra Attack Speed.")?.sheetStats, { attack_speed_pct: 0.15 });
assert.deepEqual(parseArtifactStaticEffect("The wearer obtains 20.0 extra Enlightenment.")?.sheetStats, { enlightenment: 20 });

for (const rejected of [
  "The wearer obtains 15% extra Defense when any ally is nearby.",
  "When the wearer launches an ultimate skill, has a 50.0% chance of obtaining 20% extra Crit Rate for 10.0s.",
  "The wearer's HP increases by 5%, and Defense by 5%. This effect doubles for non-Legendary Heroes.",
  "The wearer obtains 15 extra Crit Damage.",
  "The wearer obtains 20% extra Enlightenment."
]) assert.equal(parseArtifactStaticEffect(rejected), null, rejected);

assert.equal(compileArtifactStaticEffectLevels([
  { refinement: 0, description: "The wearer obtains 10% extra HP." },
  { refinement: 1, description: "The wearer obtains 12% extra HP." }
]).length, 2);
assert.equal(compileArtifactStaticEffectLevels([
  { refinement: 0, description: "The wearer obtains 10% extra HP." },
  { refinement: 1, description: "When hit, gains 12% extra HP." }
]).length, 0);

console.log("Artifact static-effect parser tests passed: strict unconditional whitelist and all-refinement gate");
