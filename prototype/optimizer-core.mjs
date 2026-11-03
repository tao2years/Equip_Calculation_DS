export const SLOT_IDS = ["helmet", "weapon", "chest", "gloves", "positive_rune", "negative_rune"];
export const SHEET_STAT_IDS = ["hp_sheet", "atk_sheet", "def_sheet", "crit_rate", "crit_damage", "accuracy", "resistance", "enlightenment", "skill_haste", "attack_speed_pct"];
const gameDataIndexCache = new WeakMap();

function gameDataIndexes(gameData) {
  let indexes = gameDataIndexCache.get(gameData);
  if (!indexes) {
    indexes = {
      sets: new Map((gameData.sets || []).map((entry) => [entry.id, entry])),
      heroes: new Map((gameData.heroes || []).map((entry) => [entry.id, entry])),
      artifacts: new Map((gameData.artifacts || []).map((entry) => [entry.id, entry]))
    };
    gameDataIndexCache.set(gameData, indexes);
  }
  return indexes;
}

function addStats(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value === "number") target[key] = (target[key] || 0) + value;
  }
  return target;
}

function setName(gameData, setId) {
  const set = gameDataIndexes(gameData).sets.get(setId);
  return set?.names.zh || set?.names.en || setId || "散件";
}

function activeSetBonuses(gameData, items, includeLabels = true) {
  const counts = {};
  for (const item of items) if (item.setId) counts[item.setId] = (counts[item.setId] || 0) + 1;
  const stats = {};
  const labels = [];
  for (const [setId, count] of Object.entries(counts)) {
    const definition = gameDataIndexes(gameData).sets.get(setId);
    if (!definition) continue;
    for (const bonus of definition.bonuses || []) {
      if (count >= bonus.pieces) {
        addStats(stats, bonus.sheetStats);
        if (includeLabels) labels.push(`${setName(gameData, setId)} ${bonus.pieces}件`);
      }
    }
  }
  return { stats, labels };
}

export function effectiveHeroBase(hero, ownedHero) {
  if (ownedHero?.baseStatsOverride && Object.keys(ownedHero.baseStatsOverride).length) {
    return { stats: { ...hero.baseStats, ...ownedHero.baseStatsOverride }, source: "账号快照 baseStatsOverride" };
  }
  const level = Math.max(1, Number(ownedHero?.level || 1));
  const stats = { ...hero.baseStats };
  for (const [key, growth] of Object.entries(hero.perLevelGrowth || {})) {
    if (typeof growth === "number") stats[key] = (stats[key] || 0) + growth * (level - 1);
  }
  return { stats, source: level === 1 ? "公共目录一级基础值" : `公共目录一级基础值 + 每级成长 × ${level - 1}（未验证星级/灵感修正）` };
}

function observedArtifactStats(artifact) {
  if (Array.isArray(artifact?.observedStats) && artifact.observedStats.length) {
    return Object.fromEntries(artifact.observedStats
      .filter((entry) => entry?.stat && typeof entry.value === "number")
      .map((entry) => [entry.stat, entry.value]));
  }
  if (artifact?.stats && Object.keys(artifact.stats).length) return { ...artifact.stats };
  return {};
}

export function resolveArtifactStats(gameData, artifact) {
  if (!artifact) return { stats: {}, source: "none", definition: null, publicStats: {}, observedStats: {}, warnings: ["未选择神器"] };
  const definition = gameDataIndexes(gameData).artifacts.get(artifact.artifactDefinitionId) || null;
  const level = Number(artifact.level);
  const curve = definition?.levelCurve || definition?.refinementCurve || [];
  const curveEntry = Number.isInteger(level) ? curve.find((entry) => entry.level === level) : null;
  const publicStats = Object.fromEntries(Object.entries(curveEntry?.values || {}).filter(([, value]) => typeof value === "number"));
  const observedStats = observedArtifactStats(artifact);
  const warnings = [];
  if (!definition) warnings.push(`神器定义不存在：${artifact.artifactDefinitionId}`);
  else if (!Number.isInteger(level)) warnings.push("账号神器缺少强化等级，无法选择公共属性曲线");
  else if (!curveEntry) warnings.push(`公共目录没有神器 +${level} 的属性曲线`);
  if (Object.keys(observedStats).length) {
    if (Object.keys(publicStats).length) {
      const mismatches = [...new Set([...Object.keys(observedStats), ...Object.keys(publicStats)])]
        .filter((key) => Math.abs((observedStats[key] || 0) - (publicStats[key] || 0)) > 1e-9);
      if (mismatches.length) warnings.push(`账号观测属性与公共 +${level} 曲线不同：${mismatches.join("、")}；计算采用账号观测值`);
    }
    return {
      stats: observedStats,
      source: Array.isArray(artifact.observedStats) && artifact.observedStats.length ? "account_observed" : "legacy_account_stats",
      definition,
      publicStats,
      observedStats,
      warnings
    };
  }
  if (Object.keys(publicStats).length) return { stats: publicStats, source: "public_level_curve", definition, publicStats, observedStats, warnings };
  warnings.push("神器没有可用于计算的静态面板属性");
  return { stats: {}, source: "unavailable", definition, publicStats, observedStats, warnings };
}

export function calculateSheet(gameData, hero, ownedHero, gear, artifact, options = {}) {
  const bonus = {};
  gear.forEach((item) => addStats(bonus, item.stats));
  const resolvedArtifact = options.resolvedArtifact || resolveArtifactStats(gameData, artifact);
  addStats(bonus, resolvedArtifact.stats);
  const sets = activeSetBonuses(gameData, gear, options.includeLabels !== false);
  addStats(bonus, sets.stats);
  const effectiveBase = effectiveHeroBase(hero, ownedHero);
  const base = effectiveBase.stats;
  const result = { ...base };
  result.atk_sheet = (base.atk_flat || 0) * (1 + (bonus.atk_pct || 0)) + (bonus.atk_flat || 0);
  result.hp_sheet = (base.hp_flat || 0) * (1 + (bonus.hp_pct || 0)) + (bonus.hp_flat || 0);
  result.def_sheet = (base.def_flat || 0) * (1 + (bonus.def_pct || 0)) + (bonus.def_flat || 0);
  for (const key of ["crit_rate", "crit_damage", "accuracy", "resistance", "enlightenment", "skill_haste", "attack_speed_pct"]) {
    result[key] = (base[key] || 0) + (bonus[key] || 0);
  }
  return {
    stats: result,
    setLabels: sets.labels,
    heroBaseSource: effectiveBase.source,
    artifactStatSource: resolvedArtifact.source,
    artifactStatWarnings: resolvedArtifact.warnings
  };
}

export function objectiveValue(stats, objective) {
  if (typeof objective === "object" && objective) {
    let raw;
    if (objective.kind === "crit_proxy") raw = stats.atk_sheet * (1 + Math.min(Math.max(stats.crit_rate, 0), 1) * stats.crit_damage);
    else if (objective.kind === "full_crit_damage_proxy") raw = stats.atk_sheet * (1 + stats.crit_damage);
    else if (objective.kind === "single_stat") raw = stats[objective.stat] || 0;
    else if (objective.kind === "weighted_stats") raw = Object.entries(objective.weights || {}).reduce((total, [key, weight]) => total + (stats[key] || 0) * weight, 0);
    else throw new Error(`Unsupported objective kind ${objective.kind}`);
    return objective.direction === "minimize" ? -raw : raw;
  }
  if (objective === "atk") return stats.atk_sheet;
  if (objective === "hp") return stats.hp_sheet;
  if (objective === "crit_damage") return stats.crit_damage;
  if (objective === "accuracy") return stats.accuracy;
  return stats.atk_sheet * (1 + Math.min(Math.max(stats.crit_rate, 0), 1) * stats.crit_damage);
}

function meetsConstraints(stats, constraints) {
  if (Array.isArray(constraints)) {
    return constraints.every((constraint) => {
      const actual = stats[constraint.stat] || 0;
      if (constraint.op === ">=") return actual >= constraint.value;
      if (constraint.op === ">") return actual > constraint.value;
      if (constraint.op === "<=") return actual <= constraint.value;
      if (constraint.op === "<") return actual < constraint.value;
      if (constraint.op === "=") return Math.abs(actual - constraint.value) < 1e-9;
      throw new Error(`Unsupported constraint operator ${constraint.op}`);
    });
  }
  return Object.entries(constraints).every(([key, value]) => (stats[key] || 0) >= value);
}

function buildComparator(a, b) {
  return b.score - a.score || a.gear.map((item) => item.ownedItemId).join("|").localeCompare(b.gear.map((item) => item.ownedItemId).join("|"));
}

function insertTopBuild(top, build, limit) {
  top.push(build);
  top.sort(buildComparator);
  if (top.length > limit) top.pop();
}

function normalizedConstraints(constraints) {
  if (Array.isArray(constraints)) return constraints;
  return Object.entries(constraints || {}).map(([stat, value]) => ({ stat, op: ">=", value }));
}

function constraintsPossible(bounds, constraints) {
  return constraints.every((constraint) => {
    const low = bounds.minima[constraint.stat] ?? 0;
    const high = bounds.maxima[constraint.stat] ?? 0;
    if (constraint.op === ">=") return high >= constraint.value;
    if (constraint.op === ">") return high > constraint.value;
    if (constraint.op === "<=") return low <= constraint.value;
    if (constraint.op === "<") return low < constraint.value;
    if (constraint.op === "=") return constraint.value >= low && constraint.value <= high;
    throw new Error(`Unsupported constraint operator ${constraint.op}`);
  });
}

function rangeProduct(minima, maxima, keys, evaluator) {
  const values = keys.map((key) => {
    const points = [minima[key] || 0, maxima[key] || 0];
    if (key === "crit_rate") points.push(0, 1);
    return [...new Set(points)];
  });
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const a of values[0]) for (const b of values[1]) for (const c of values[2]) {
    const value = evaluator(a, b, c);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return { low, high };
}

function objectiveScoreUpperBound(bounds, objective) {
  const direction = typeof objective === "object" && objective?.direction === "minimize" ? "minimize" : "maximize";
  let rawLow;
  let rawHigh;
  const kind = typeof objective === "object" && objective ? objective.kind : objective;
  if (kind === "single_stat") {
    rawLow = bounds.minima[objective.stat] || 0;
    rawHigh = bounds.maxima[objective.stat] || 0;
  } else if (kind === "weighted_stats") {
    rawLow = 0;
    rawHigh = 0;
    for (const [key, weight] of Object.entries(objective.weights || {})) {
      const low = bounds.minima[key] || 0;
      const high = bounds.maxima[key] || 0;
      rawLow += weight >= 0 ? low * weight : high * weight;
      rawHigh += weight >= 0 ? high * weight : low * weight;
    }
  } else if (kind === "full_crit_damage_proxy") {
    const range = rangeProduct(bounds.minima, bounds.maxima, ["atk_sheet", "crit_damage"],
      (attack, critDamage) => attack * (1 + critDamage));
    rawLow = range.min;
    rawHigh = range.max;
  } else if (kind === "crit_proxy" || !["atk", "hp", "crit_damage", "accuracy"].includes(kind)) {
    const range = rangeProduct(bounds.minima, bounds.maxima, ["atk_sheet", "crit_rate", "crit_damage"],
      (attack, critRate, critDamage) => attack * (1 + Math.min(Math.max(critRate, 0), 1) * critDamage));
    rawLow = range.low;
    rawHigh = range.high;
  } else {
    const stat = kind === "atk" ? "atk_sheet" : kind === "hp" ? "hp_sheet" : kind;
    rawLow = bounds.minima[stat] || 0;
    rawHigh = bounds.maxima[stat] || 0;
  }
  return direction === "minimize" ? -rawLow : rawHigh;
}

function itemOrderScore(item, objective) {
  const stats = item.stats || {};
  const kind = typeof objective === "object" && objective ? objective.kind : objective;
  const direction = typeof objective === "object" && objective?.direction === "minimize" ? -1 : 1;
  if (kind === "single_stat") {
    const raw = objective.stat === "atk_sheet" ? (stats.atk_flat || 0) + 1000 * (stats.atk_pct || 0)
      : objective.stat === "hp_sheet" ? (stats.hp_flat || 0) + 10000 * (stats.hp_pct || 0)
      : objective.stat === "def_sheet" ? (stats.def_flat || 0) + 1000 * (stats.def_pct || 0)
      : stats[objective.stat] || 0;
    return direction * raw;
  }
  if (kind === "weighted_stats") {
    return direction * Object.entries(objective.weights || {}).reduce((sum, [key, weight]) => sum + (stats[key] || 0) * weight, 0);
  }
  if (kind === "hp") return (stats.hp_flat || 0) + 10000 * (stats.hp_pct || 0);
  if (kind === "crit_damage") return stats.crit_damage || 0;
  if (kind === "accuracy") return stats.accuracy || 0;
  if (kind === "atk") return (stats.atk_flat || 0) + 1000 * (stats.atk_pct || 0);
  return (stats.atk_flat || 0) + 1000 * (stats.atk_pct || 0) + 3000 * (stats.crit_rate || 0) + 1000 * (stats.crit_damage || 0);
}

function itemStatProxy(item, stat) {
  const stats = item.stats || {};
  if (stat === "atk_sheet") return (stats.atk_flat || 0) + 1000 * (stats.atk_pct || 0);
  if (stat === "hp_sheet") return (stats.hp_flat || 0) + 10000 * (stats.hp_pct || 0);
  if (stat === "def_sheet") return (stats.def_flat || 0) + 1000 * (stats.def_pct || 0);
  return stats[stat] || 0;
}

function selectHeuristicCandidates(group, objective, constraints, cap) {
  if (group.length <= cap) return [...group];
  const lenses = [];
  const kind = typeof objective === "object" && objective ? objective.kind : objective;
  const direction = typeof objective === "object" && objective?.direction === "minimize" ? -1 : 1;
  lenses.push((item) => itemOrderScore(item, objective));
  if (kind === "crit_proxy" || !["single_stat", "weighted_stats", "atk", "hp", "crit_damage", "accuracy"].includes(kind)) {
    lenses.push((item) => itemStatProxy(item, "atk_sheet"));
    lenses.push((item) => itemStatProxy(item, "crit_rate"));
    lenses.push((item) => itemStatProxy(item, "crit_damage"));
  } else if (kind === "single_stat") {
    lenses.push((item) => direction * itemStatProxy(item, objective.stat));
  }
  for (const constraint of constraints) {
    const sign = constraint.op === "<=" || constraint.op === "<" ? -1 : 1;
    lenses.push((item) => sign * itemStatProxy(item, constraint.stat));
  }

  const selected = new Map();
  const add = (item, reason) => {
    if (selected.size >= cap || selected.has(item.ownedItemId)) return;
    selected.set(item.ownedItemId, { item, reasons: [reason] });
  };
  const composite = lenses[0];
  const bestBySet = new Map();
  for (const item of group) {
    const setKey = item.setId || "__no_set__";
    const current = bestBySet.get(setKey);
    if (!current || composite(item) > composite(current) || (composite(item) === composite(current) && item.ownedItemId < current.ownedItemId)) bestBySet.set(setKey, item);
  }
  for (const item of [...bestBySet.values()].sort((a, b) => composite(b) - composite(a) || a.ownedItemId.localeCompare(b.ownedItemId))) add(item, "best_in_set");
  const perLens = Math.max(1, Math.floor(cap / Math.max(1, lenses.length)));
  for (const [index, lens] of lenses.entries()) {
    const ranked = [...group].sort((a, b) => lens(b) - lens(a) || a.ownedItemId.localeCompare(b.ownedItemId));
    for (const item of ranked.slice(0, perLens)) add(item, `lens_${index}`);
  }
  for (const item of [...group].sort((a, b) => composite(b) - composite(a) || a.ownedItemId.localeCompare(b.ownedItemId))) add(item, "composite_fill");
  return [...selected.values()].map((entry) => entry.item);
}

function buildBoundContext(gameData, groups, heroBase, artifactStats) {
  const bonusSets = (gameData.sets || []).filter((set) => set.bonuses?.length);
  const rawKeys = new Set(["atk_flat", "atk_pct", "hp_flat", "hp_pct", "def_flat", "def_pct", ...SHEET_STAT_IDS.slice(3)]);
  for (const item of groups.flat()) for (const key of Object.keys(item.stats || {})) rawKeys.add(key);
  for (const key of Object.keys(artifactStats || {})) rawKeys.add(key);
  for (const set of bonusSets) for (const bonus of set.bonuses || []) for (const key of Object.keys(bonus.sheetStats || {})) rawKeys.add(key);

  const suffixMin = Array.from({ length: groups.length + 1 }, () => ({}));
  const suffixMax = Array.from({ length: groups.length + 1 }, () => ({}));
  for (const key of rawKeys) suffixMin[groups.length][key] = suffixMax[groups.length][key] = 0;
  for (let depth = groups.length - 1; depth >= 0; depth -= 1) {
    for (const key of rawKeys) {
      const values = groups[depth].map((item) => item.stats?.[key] || 0);
      suffixMin[depth][key] = suffixMin[depth + 1][key] + Math.min(...values);
      suffixMax[depth][key] = suffixMax[depth + 1][key] + Math.max(...values);
    }
  }

  const remainingSetCapacity = Array.from({ length: groups.length + 1 }, () => ({}));
  for (let depth = groups.length - 1; depth >= 0; depth -= 1) {
    remainingSetCapacity[depth] = { ...remainingSetCapacity[depth + 1] };
    for (const setId of new Set(groups[depth].map((item) => item.setId).filter(Boolean))) {
      remainingSetCapacity[depth][setId] = (remainingSetCapacity[depth][setId] || 0) + 1;
    }
  }
  return { rawKeys: [...rawKeys], suffixMin, suffixMax, remainingSetCapacity, heroBase, artifactStats, bonusSets };
}

function sheetBounds(gameData, boundContext, depth, partialRaw, selectedSetCounts) {
  const rawMin = {};
  const rawMax = {};
  for (const key of boundContext.rawKeys) {
    rawMin[key] = (partialRaw[key] || 0) + (boundContext.suffixMin[depth][key] || 0);
    rawMax[key] = (partialRaw[key] || 0) + (boundContext.suffixMax[depth][key] || 0);
  }
  for (const set of boundContext.bonusSets) {
    const possibleCount = (selectedSetCounts[set.id] || 0) + (boundContext.remainingSetCapacity[depth][set.id] || 0);
    for (const bonus of set.bonuses || []) {
      if (possibleCount < bonus.pieces) continue;
      for (const [key, value] of Object.entries(bonus.sheetStats || {})) {
        if (value >= 0) rawMax[key] = (rawMax[key] || 0) + value;
        else rawMin[key] = (rawMin[key] || 0) + value;
      }
    }
  }
  const base = boundContext.heroBase;
  const minima = {};
  const maxima = {};
  for (const [sheetKey, flatKey, percentKey] of [
    ["atk_sheet", "atk_flat", "atk_pct"],
    ["hp_sheet", "hp_flat", "hp_pct"],
    ["def_sheet", "def_flat", "def_pct"]
  ]) {
    const corners = [
      base[flatKey] * (1 + (rawMin[percentKey] || 0)) + (rawMin[flatKey] || 0),
      base[flatKey] * (1 + (rawMin[percentKey] || 0)) + (rawMax[flatKey] || 0),
      base[flatKey] * (1 + (rawMax[percentKey] || 0)) + (rawMin[flatKey] || 0),
      base[flatKey] * (1 + (rawMax[percentKey] || 0)) + (rawMax[flatKey] || 0)
    ];
    minima[sheetKey] = Math.min(...corners);
    maxima[sheetKey] = Math.max(...corners);
  }
  for (const key of SHEET_STAT_IDS.slice(3)) {
    minima[key] = (base[key] || 0) + (rawMin[key] || 0);
    maxima[key] = (base[key] || 0) + (rawMax[key] || 0);
  }
  return { minima, maxima };
}

export function enumerateBuilds({
  gameData, account, ownedHeroId, artifactId, fixed = {}, excludedItemIds = [], candidatePolicy = null,
  constraints = {}, objective = "crit_proxy", limit = 20, solverMode = "auto", exhaustiveThreshold = 100_000,
  exactBranchThreshold = 5_000_000, heuristicCandidateCap = 10
}) {
  const ownedHero = account.ownedHeroes.find((item) => item.ownedHeroId === ownedHeroId);
  if (!ownedHero) throw new Error(`Unknown owned hero ${ownedHeroId}`);
  const hero = gameDataIndexes(gameData).heroes.get(ownedHero.heroDefinitionId);
  if (!hero) throw new Error(`Missing hero definition ${ownedHero.heroDefinitionId}`);
  const artifact = account.ownedArtifacts.find((item) => item.ownedArtifactId === artifactId);
  if (!artifact) throw new Error(`Unknown owned artifact ${artifactId}`);
  const resolvedArtifact = resolveArtifactStats(gameData, artifact);

  const excluded = new Set(excludedItemIds);
  const groups = SLOT_IDS.map((slot) => {
    let candidates = account.ownedGear.filter((item) => item.slot === slot);
    if (fixed[slot]) {
      candidates = candidates.filter((item) => item.ownedItemId === fixed[slot]);
    } else {
      candidates = candidates.filter((item) => !excluded.has(item.ownedItemId));
      if (candidatePolicy?.respectItemLocks) candidates = candidates.filter((item) => !item.locked);
      if (candidatePolicy?.equippedItems === "inventory_only") candidates = candidates.filter((item) => !item.equippedBy);
      if (candidatePolicy?.equippedItems === "selected_heroes") {
        const allowed = new Set(candidatePolicy.allowedOwnerIds || []);
        candidates = candidates.filter((item) => !item.equippedBy || allowed.has(item.equippedBy));
      }
    }
    if (!candidates.length) throw new Error(`No candidate gear for ${slot}`);
    return candidates;
  });
  const userConstraints = normalizedConstraints(constraints);
  const impliedConstraints = typeof objective === "object" && objective?.kind === "full_crit_damage_proxy"
    ? [{ stat: "crit_rate", op: ">=", value: 1, layer: "sheet", source: "objective_full_crit" }]
    : [];
  const constraintsList = [...userConstraints, ...impliedConstraints];
  const searchSpace = groups.reduce((product, group) => product * group.length, 1);
  const mode = solverMode === "auto"
    ? (searchSpace <= exhaustiveThreshold ? "exhaustive" : searchSpace <= exactBranchThreshold ? "branch_and_bound" : "heuristic_candidate_cap")
    : solverMode;
  if (!new Set(["exhaustive", "branch_and_bound", "heuristic_candidate_cap"]).has(mode)) throw new Error(`Unsupported solver mode ${solverMode}`);
  const searchGroups = mode === "heuristic_candidate_cap"
    ? groups.map((group) => selectHeuristicCandidates(group, objective, constraintsList, heuristicCandidateCap))
    : groups;
  const reducedSearchSpace = searchGroups.reduce((product, group) => product * group.length, 1);
  const top = [];
  const observedMaxima = Object.fromEntries(SHEET_STAT_IDS.map((key) => [key, Number.NEGATIVE_INFINITY]));
  const observedMinima = Object.fromEntries(SHEET_STAT_IDS.map((key) => [key, Number.POSITIVE_INFINITY]));
  let evaluatedBuilds = 0;
  let validCount = 0;
  let visitedNodes = 0;
  let prunedByFeasibility = 0;
  let prunedByScore = 0;

  function evaluate(selected) {
    evaluatedBuilds += 1;
    const calculated = calculateSheet(gameData, hero, ownedHero, selected, artifact, { includeLabels: false, resolvedArtifact });
    for (const key of SHEET_STAT_IDS) {
      const value = calculated.stats[key] || 0;
      observedMaxima[key] = Math.max(observedMaxima[key], value);
      observedMinima[key] = Math.min(observedMinima[key], value);
    }
    if (!meetsConstraints(calculated.stats, constraintsList)) return;
    validCount += 1;
    const score = objectiveValue(calculated.stats, objective);
    const canEnterTop = top.length < limit || score >= top[top.length - 1].score - 1e-12;
    if (!canEnterTop) return;
    const setLabels = activeSetBonuses(gameData, selected, true).labels;
    insertTopBuild(top, {
      gear: selected,
      artifact,
      stats: calculated.stats,
      setLabels,
      heroBaseSource: calculated.heroBaseSource,
      artifactStatSource: calculated.artifactStatSource,
      artifactStatWarnings: calculated.artifactStatWarnings,
      score,
      objectiveScore: typeof objective === "object" && objective?.direction === "minimize" ? -score : score
    }, limit);
  }

  if (mode === "exhaustive") {
    function visitAll(depth, selected) {
      visitedNodes += 1;
      if (depth < groups.length) {
        for (const item of groups[depth]) visitAll(depth + 1, [...selected, item]);
        return;
      }
      evaluate(selected);
    }
    visitAll(0, []);
    return {
      searched: evaluatedBuilds,
      searchSpace,
      validCount,
      maxima: observedMaxima,
      minima: observedMinima,
      results: top,
      appliedConstraints: constraintsList,
      impliedConstraints,
      solver: { mode, searchSpace, evaluatedBuilds, visitedNodes, prunedByFeasibility, prunedByScore, topNExact: true, validCountExact: true, extremaExact: true }
    };
  }

  const effectiveBase = effectiveHeroBase(hero, ownedHero).stats;
  const boundContext = buildBoundContext(gameData, searchGroups, effectiveBase, resolvedArtifact.stats);
  const partialRaw = { ...resolvedArtifact.stats };
  const selectedSetCounts = {};
  const rootBounds = sheetBounds(gameData, boundContext, 0, partialRaw, selectedSetCounts);
  const orderedGroups = searchGroups.map((group) => [...group].sort((a, b) => itemOrderScore(b, objective) - itemOrderScore(a, objective) || a.ownedItemId.localeCompare(b.ownedItemId)));

  function addItem(item, direction) {
    for (const [key, value] of Object.entries(item.stats || {})) partialRaw[key] = (partialRaw[key] || 0) + direction * value;
    if (item.setId) selectedSetCounts[item.setId] = (selectedSetCounts[item.setId] || 0) + direction;
  }

  function visitBounded(depth, selected, bounds) {
    visitedNodes += 1;
    if (!constraintsPossible(bounds, constraintsList)) {
      prunedByFeasibility += 1;
      return;
    }
    if (top.length >= limit) {
      const worstScore = top[top.length - 1].score;
      if (objectiveScoreUpperBound(bounds, objective) < worstScore - 1e-12) {
        prunedByScore += 1;
        return;
      }
    }
    if (depth === orderedGroups.length) {
      evaluate([...selected]);
      return;
    }
    const children = [];
    for (const item of orderedGroups[depth]) {
      addItem(item, 1);
      const childBounds = sheetBounds(gameData, boundContext, depth + 1, partialRaw, selectedSetCounts);
      children.push({ item, bounds: childBounds, upper: objectiveScoreUpperBound(childBounds, objective) });
      addItem(item, -1);
    }
    children.sort((a, b) => b.upper - a.upper || a.item.ownedItemId.localeCompare(b.item.ownedItemId));
    for (const child of children) {
      addItem(child.item, 1);
      selected.push(child.item);
      visitBounded(depth + 1, selected, child.bounds);
      selected.pop();
      addItem(child.item, -1);
    }
  }

  visitBounded(0, [], rootBounds);
  return {
    searched: evaluatedBuilds,
    searchSpace,
    validCount,
    maxima: rootBounds.maxima,
    minima: rootBounds.minima,
    results: top,
    appliedConstraints: constraintsList,
    impliedConstraints,
    solver: {
      mode, searchSpace, reducedSearchSpace, evaluatedBuilds, visitedNodes, prunedByFeasibility, prunedByScore,
      candidateCounts: groups.map((group, index) => ({ slot: SLOT_IDS[index], before: group.length, after: searchGroups[index].length })),
      topNExact: mode !== "heuristic_candidate_cap", validCountExact: mode !== "heuristic_candidate_cap" && prunedByScore === 0,
      extremaExact: false,
      optimality: mode === "heuristic_candidate_cap" ? "heuristic_within_reduced_candidates" : "global_top_n_exact"
    }
  };
}
