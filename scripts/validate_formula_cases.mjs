#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { calculateSheet } from "../prototype/optimizer-core.mjs";

function option(name) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

export function validateFormulaCases(suite) {
  const results = suite.cases.map((entry) => {
    const hero = { id: entry.heroDefinitionId, baseStats: entry.baseStats, perLevelGrowth: {} };
    const ownedHero = { ownedHeroId: `owned-${entry.caseId}`, heroDefinitionId: entry.heroDefinitionId, level: 1 };
    const gear = [{ ownedItemId: `bonus-${entry.caseId}`, slot: "helmet", setId: null, stats: entry.bonusStats }];
    const calculated = calculateSheet({ sets: [], artifacts: [] }, hero, ownedHero, gear, null).stats;
    const comparisons = Object.fromEntries(Object.entries(entry.observedSheetStats).map(([stat, observed]) => {
      const predicted = calculated[stat] ?? 0;
      const absoluteError = Math.abs(predicted - observed);
      return [stat, { predicted, observed, absoluteError, pass: absoluteError <= entry.absoluteTolerance }];
    }));
    const failedStats = Object.entries(comparisons).filter(([, value]) => !value.pass).map(([stat]) => stat);
    return { caseId: entry.caseId, status: failedStats.length ? "failed" : "passed", failedStats, comparisons, sourceEvidence: entry.sourceEvidence };
  });
  const failed = results.filter((entry) => entry.status === "failed").length;
  return {
    schemaVersion: "0.1.0",
    validatedAt: suite.createdAt,
    suiteId: suite.suiteId,
    formulaId: "prototype-sheet-v1",
    evidenceLevel: suite.evidenceLevel,
    status: failed ? "failed" : "passed",
    counts: { total: results.length, passed: results.length - failed, failed },
    cases: results,
    limitations: suite.evidenceLevel === "client_observation"
      ? "Passing cases validate only the represented channel/build, stats and scenarios; conditional combat effects remain outside this sheet formula."
      : "Synthetic cases validate implementation arithmetic only and provide no evidence that the formula matches a live client."
  };
}

const input = option("input");
const output = option("output");
if (input && output) {
  const suite = JSON.parse(await readFile(path.resolve(input), "utf8"));
  const report = validateFormulaCases(suite);
  await writeFile(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ command: "validate-formula-cases", input: path.resolve(input), output: path.resolve(output), status: report.status, counts: report.counts }, null, 2));
  if (report.status !== "passed") process.exitCode = 2;
} else if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  throw new Error("Usage: node scripts/validate_formula_cases.mjs --input cases.json --output report.json");
}
