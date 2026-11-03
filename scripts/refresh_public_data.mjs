#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const date = process.argv.find((value) => value.startsWith("--date="))?.slice(7) || new Date().toISOString().slice(0, 10);
const dryRun = process.argv.includes("--dry-run");
const CORE_SOURCES = ["SRC-004", "SRC-005", "SRC-024"];
const BUILD_STEPS = [
  "scripts/compile_public_heroes.mjs",
  "scripts/compile_public_catalogs.mjs",
  "scripts/build_game_data.mjs",
  "scripts/build_import_dictionary.mjs",
  "scripts/build_equipment_rules.mjs",
  "scripts/audit_public_domain.mjs",
  "scripts/audit_equipment_model.mjs",
  "scripts/compile_cn_name_candidates.mjs"
];

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): node ${args.join(" ")}`);
}

if (dryRun) {
  console.log(JSON.stringify({
    date,
    captureSources: CORE_SOURCES,
    reuseExisting: true,
    buildSteps: BUILD_STEPS,
    note: "Only load-bearing sources are refreshed; supporting research sources remain separately curated."
  }, null, 2));
} else {
  for (const sourceId of CORE_SOURCES) {
    run(["scripts/crawl_public_data.mjs", `--source=${sourceId}`, `--date=${date}`, "--reuse-existing"]);
  }
  for (const step of BUILD_STEPS) run([step]);
  console.log(`Public data refresh complete for ${date}. Run scripts/verify.ps1 before committing generated changes.`);
}
