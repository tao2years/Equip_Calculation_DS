import { enumerateBuilds } from "./optimizer-core.mjs";

export function executeOptimizationRequest({ account, request, gameData }) {
  if (request.snapshotId !== account.snapshotId) {
    throw new Error(`Request snapshotId ${request.snapshotId} does not match ${account.snapshotId}`);
  }
  for (const constraint of request.constraints || []) {
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
    constraints: request.constraints || [],
    objective: request.objective,
    allowUnverifiedHeroGrowth: request.calculationPolicy?.allowUnverifiedHeroGrowth === true,
    limit: request.resultLimit
  });
  return {
    schemaVersion: "0.1.0",
    requestId: request.requestId,
    snapshotId: account.snapshotId,
    gameDataVersionId: gameData.dataVersion.id,
    objective: request.objective,
    appliedConstraints: outcome.appliedConstraints,
    impliedConstraints: outcome.impliedConstraints,
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
}
