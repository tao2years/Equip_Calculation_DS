export const HERO_BASE_STAT_KEYS = ["hp_flat", "def_flat", "atk_flat", "crit_rate", "crit_damage", "accuracy", "resistance", "enlightenment", "skill_haste", "attack_speed_pct"];
export const HERO_RATIO_GROWTH_KEYS = ["crit_rate", "crit_damage", "attack_speed_pct"];

function quantile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function distribution(heroes, stat) {
  const values = heroes.map((hero) => hero.baseStats?.[stat]).filter(Number.isFinite).sort((left, right) => left - right);
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return {
    count: values.length,
    min: values[0] ?? null,
    q1,
    median: quantile(values, 0.5),
    q3,
    max: values.at(-1) ?? null,
    upperReviewFence: q3 + (6 * iqr)
  };
}

function detailCrosscheck(hero, detail) {
  if (!detail) return null;
  const comparisons = [];
  for (const stat of Object.keys(detail.level1Stats || {})) {
    const catalog = hero.baseStats?.[stat];
    const observed = detail.level1Stats[stat];
    if (!Number.isFinite(catalog) || !Number.isFinite(observed)) continue;
    const tolerance = stat.endsWith("_flat") ? 0.5 : 0.000001;
    comparisons.push({ stat, catalog, detail: observed, delta: Number((catalog - observed).toFixed(8)), tolerance, withinTolerance: Math.abs(catalog - observed) <= tolerance });
  }
  return {
    sourceId: detail.evidence.sourceId,
    snapshotSha256: detail.evidence.snapshotSha256,
    comparisons,
    status: comparisons.length && comparisons.every((entry) => entry.withinTolerance) ? "passed" : "failed"
  };
}

export function analyzeHeroDataQuality(heroes, detailHeroes = []) {
  const distributions = Object.fromEntries(["hp_flat", "def_flat", "atk_flat"].map((stat) => [stat, distribution(heroes, stat)]));
  const details = new Map(detailHeroes.map((entry) => [String(entry.externalId), entry]));
  const records = heroes.map((hero) => {
    const anomalyFlags = [];
    for (const stat of HERO_BASE_STAT_KEYS) {
      if (!Number.isFinite(hero.baseStats?.[stat])) anomalyFlags.push(`missing_or_non_numeric:${stat}`);
    }
    for (const stat of ["hp_flat", "def_flat", "atk_flat"]) {
      const value = hero.baseStats?.[stat];
      if (Number.isFinite(value) && value > distributions[stat].upperReviewFence) anomalyFlags.push(`robust_upper_outlier:${stat}`);
      if (Number.isFinite(value) && value <= 0) anomalyFlags.push(`non_positive:${stat}`);
    }
    for (const stat of ["crit_rate", "crit_damage", "attack_speed_pct"]) {
      const value = hero.baseStats?.[stat];
      if (Number.isFinite(value) && (value < 0 || value > 2)) anomalyFlags.push(`ratio_out_of_review_range:${stat}`);
    }
    const ratioGrowthStats = HERO_RATIO_GROWTH_KEYS.filter((stat) => Number(hero.perLevelGrowth?.[stat] || 0) !== 0);
    const crosscheck = detailCrosscheck(hero, details.get(String(hero.externalId)));
    return {
      heroDefinitionId: hero.id,
      externalId: hero.externalId,
      name: hero.names?.zh || hero.names?.en || hero.id,
      evidenceStatus: crosscheck?.status === "passed" ? "independent_detail_crosschecked" : "public_catalog_only",
      anomalyFlags,
      ratioGrowthStats,
      requiresObservedBaseStats: anomalyFlags.length > 0,
      crosscheck
    };
  });
  return { distributions, records };
}
