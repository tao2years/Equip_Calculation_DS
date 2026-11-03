#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { enumerateBuilds } from "../prototype/optimizer-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const accountPath = path.resolve(option("account", path.join(ROOT, "examples", "account-snapshot.example.json")));
const requestPath = path.resolve(option("request", path.join(ROOT, "examples", "optimization-request.example.json")));
const gameDataPath = path.resolve(option("game-data", path.join(ROOT, "data", "game-data.public.json")));
const outputOption = option("output");
const [account, request, gameData] = await Promise.all([
  readFile(accountPath, "utf8").then(JSON.parse),
  readFile(requestPath, "utf8").then(JSON.parse),
  readFile(gameDataPath, "utf8").then(JSON.parse)
]);
if (request.snapshotId !== account.snapshotId) throw new Error(`Request snapshotId ${request.snapshotId} does not match ${account.snapshotId}`);
for (const constraint of request.constraints) {
  if (constraint.layer !== "sheet") throw new Error(`Only sheet constraints are executable in the current solver: ${constraint.stat} uses ${constraint.layer}`);
}
const { artifact, ...fixedGear } = request.fixedItems || {};
if (!artifact) throw new Error("Optimization request must fix/select an artifact in the current solver");
const outcome = enumerateBuilds({
  gameData,
  account,
  ownedHeroId: request.ownedHeroId,
  artifactId: artifact,
  fixed: fixedGear,
  excludedItemIds: request.excludedItemIds || [],
  candidatePolicy: request.candidatePolicy,
  constraints: request.constraints,
  objective: request.objective,
  limit: request.resultLimit
});
const output = {
  schemaVersion: "0.1.0",
  requestId: request.requestId,
  snapshotId: account.snapshotId,
  gameDataVersionId: gameData.dataVersion.id,
  searched: outcome.searched,
  solver: outcome.solver,
  validCount: outcome.validCount,
  maxima: outcome.maxima,
  minima: outcome.minima,
  results: outcome.results.map((result, index) => ({
    rank: index + 1,
    score: result.objectiveScore ?? result.score,
    ownedArtifactId: result.artifact.ownedArtifactId,
    ownedGearIds: result.gear.map((item) => item.ownedItemId),
    stats: result.stats,
    setLabels: result.setLabels,
    heroBaseSource: result.heroBaseSource,
    artifactStatSource: result.artifactStatSource,
    artifactStatWarnings: result.artifactStatWarnings
  }))
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (outputOption) await writeFile(path.resolve(outputOption), serialized);
else process.stdout.write(serialized);
