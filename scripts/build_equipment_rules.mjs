#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const curatedPath = path.join(ROOT, "research", "curated-equipment-rules.json");
const curated = JSON.parse(await readFile(curatedPath, "utf8"));
const snapshotPath = path.join(ROOT, curated.source.snapshotPath);
const [snapshot, metadata] = await Promise.all([
  readFile(snapshotPath),
  readFile(path.join(path.dirname(snapshotPath), "metadata.json"), "utf8").then(JSON.parse)
]);
const actualHash = createHash("sha256").update(snapshot).digest("hex");
if (actualHash !== curated.source.snapshotSha256 || actualHash !== metadata.sha256) {
  throw new Error(`Curated rule evidence hash mismatch: ${curated.source.snapshotPath}`);
}

const output = {
  schemaVersion: curated.schemaVersion,
  compiledAt: metadata.retrievedAt,
  evidenceLevel: "official_wiki_rule_not_client_validated",
  sources: [{
    sourceId: curated.source.sourceId,
    url: metadata.requestedUrl,
    snapshotPath: curated.source.snapshotPath,
    snapshotSha256: actualHash,
    retrievedAt: metadata.retrievedAt
  }],
  secondaryAffixRules: curated.secondaryAffixRules.map((rule) => ({ ...rule, enhancementEventCount: null, countStatus: "not_stated_in_source" })),
  primaryStatMilestones: curated.primaryStatMilestones,
  calculationRules: curated.calculationRules,
  unresolvedQuestions: curated.unresolvedQuestions,
  usagePolicy: "Research and validation input only. Do not infer owned-item rolls or enable calculator effects until target-client evidence is accepted."
};

const outputPath = path.join(ROOT, "data", "equipment-rules.public.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`built ${output.secondaryAffixRules.length} secondary-affix rules -> ${path.relative(ROOT, outputPath)}`);
