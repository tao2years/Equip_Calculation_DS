#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFormulaCases } from "./validate_formula_cases.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suite = JSON.parse(await readFile(path.join(ROOT, "examples", "formula-golden-cases.synthetic.json"), "utf8"));
const passing = validateFormulaCases(suite);
assert.equal(passing.status, "passed");
assert.deepEqual(passing.counts, { total: 2, passed: 2, failed: 0 });

const mismatched = structuredClone(suite);
mismatched.cases[0].observedSheetStats.atk_sheet = 751;
const failing = validateFormulaCases(mismatched);
assert.equal(failing.status, "failed");
assert.deepEqual(failing.cases[0].failedStats, ["atk_sheet"]);

console.log("Formula case tests passed: synthetic arithmetic match and observed-panel mismatch detection");
