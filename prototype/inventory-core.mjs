export const INVENTORY_SESSION_KEY = "dragonheir.accountSnapshot.v1";

const COLLECTIONS = {
  heroes: { property: "ownedHeroes", key: "ownedHeroId" },
  gear: { property: "ownedGear", key: "ownedItemId" },
  artifacts: { property: "ownedArtifacts", key: "ownedArtifactId" }
};

export function createEmptySnapshot(gameDataVersionId, now = new Date()) {
  return {
    schemaVersion: "0.2.0",
    snapshotId: `manual-${now.toISOString().replace(/[:.]/g, "-")}`,
    createdAt: now.toISOString(),
    gameDataVersionId,
    sourceMethod: "manual",
    warning: "手工创建的账号快照；尚未与游戏客户端自动核对。",
    ownedHeroes: [],
    ownedGear: [],
    ownedArtifacts: []
  };
}

export function parseStats(text, knownStatIds = []) {
  const known = new Set(knownStatIds);
  const stats = {};
  const source = String(text || "").trim();
  if (!source) return stats;
  for (const part of source.split(/[\n,，;；]+/).map((entry) => entry.trim()).filter(Boolean)) {
    const match = part.match(/^([a-z][a-z0-9_]*)\s*[=:：]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(%)?$/i);
    if (!match) throw new Error(`无法解析属性“${part}”，请使用 atk_flat=235 或 crit_rate=20%`);
    const [, statId, rawValue, percent] = match;
    if (known.size && !known.has(statId)) throw new Error(`未知属性 ID：${statId}`);
    if (Object.hasOwn(stats, statId)) throw new Error(`属性重复：${statId}`);
    const value = Number(rawValue) / (percent ? 100 : 1);
    if (!Number.isFinite(value)) throw new Error(`属性数值无效：${part}`);
    stats[statId] = value;
  }
  return stats;
}

export function formatStats(stats, statDefinitions = []) {
  const definitions = new Map(statDefinitions.map((entry) => [entry.id, entry]));
  return Object.entries(stats || {}).map(([statId, value]) => {
    const definition = definitions.get(statId);
    return `${definition?.labelZh || statId} ${definition?.unit === "ratio" ? `${(value * 100).toFixed(1)}%` : value}`;
  }).join(" · ");
}

export function nextOwnedId(prefix, entries, key) {
  const used = new Set(entries.map((entry) => entry[key]));
  let index = entries.length + 1;
  while (used.has(`${prefix}-${String(index).padStart(3, "0")}`)) index += 1;
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

export function validateEditableSnapshot(account, gameData) {
  const errors = [];
  const warnings = [];
  if (!account || typeof account !== "object") return { errors: ["账号文件不是 JSON 对象"], warnings };
  for (const key of ["ownedHeroes", "ownedGear", "ownedArtifacts"]) {
    if (!Array.isArray(account[key])) errors.push(`缺少 ${key} 数组`);
  }
  if (errors.length) return { errors, warnings };

  const checkUnique = (entries, key, label) => {
    const seen = new Set();
    for (const entry of entries) {
      if (!entry[key]) errors.push(`${label}缺少 ${key}`);
      else if (seen.has(entry[key])) errors.push(`${label} ID 重复：${entry[key]}`);
      seen.add(entry[key]);
    }
  };
  checkUnique(account.ownedHeroes, "ownedHeroId", "角色");
  checkUnique(account.ownedGear, "ownedItemId", "装备");
  checkUnique(account.ownedArtifacts, "ownedArtifactId", "神器");

  const sourceHashes = new Set((account.sourceFiles || []).map((entry) => String(entry.sha256 || "").toLowerCase()));
  for (const [label, entries, idKey] of [
    ["角色", account.ownedHeroes, "ownedHeroId"],
    ["装备", account.ownedGear, "ownedItemId"],
    ["神器", account.ownedArtifacts, "ownedArtifactId"]
  ]) {
    for (const entry of entries) {
      const refs = entry.evidenceRefs || [];
      if (account.sourceMethod === "screenshot_ocr" && !refs.length) errors.push(`${label} ${entry[idKey]} 缺少原始截图证据引用`);
      for (const ref of refs) {
        const digest = String(ref.sourceFileSha256 || "").toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(digest)) errors.push(`${label} ${entry[idKey]} 的证据 SHA-256 无效`);
        else if (!sourceHashes.has(digest)) errors.push(`${label} ${entry[idKey]} 的证据不在 sourceFiles 中：${digest}`);
      }
    }
  }

  const heroIds = new Set(gameData.heroes.map((entry) => entry.id));
  const artifactIds = new Set(gameData.artifacts.map((entry) => entry.id));
  const equipmentById = new Map((gameData.equipment || []).map((entry) => [entry.id, entry]));
  const setIds = new Set(gameData.sets.map((entry) => entry.id));
  const slotIds = new Set(gameData.slotDefinitions.map((entry) => entry.id).filter((id) => id !== "artifact"));
  for (const hero of account.ownedHeroes) {
    if (!heroIds.has(hero.heroDefinitionId)) errors.push(`未知角色定义：${hero.heroDefinitionId}`);
    if (!Number.isInteger(hero.level) || hero.level < 1) errors.push(`角色 ${hero.ownedHeroId} 等级无效`);
    if (hero.level > 1 && (!hero.baseStatsOverride || !Object.keys(hero.baseStatsOverride).length)) errors.push(`角色 ${hero.ownedHeroId} 等级大于 1 但缺少账号观测基础属性`);
  }
  for (const item of account.ownedGear) {
    if (!slotIds.has(item.slot)) errors.push(`装备 ${item.ownedItemId} 槽位无效：${item.slot}`);
    if (item.setId && !setIds.has(item.setId)) warnings.push(`装备 ${item.ownedItemId} 使用未知套装：${item.setId}`);
    if (!item.stats || typeof item.stats !== "object") errors.push(`装备 ${item.ownedItemId} 缺少 stats`);
    if (item.definitionId) {
      const definition = equipmentById.get(item.definitionId);
      if (!definition) errors.push(`装备 ${item.ownedItemId} 使用未知公共定义：${item.definitionId}`);
      else {
        if (definition.slot !== "unknown" && definition.slot !== item.slot) errors.push(`装备 ${item.ownedItemId} 槽位与公共定义冲突：${item.slot} / ${definition.slot}`);
        if (definition.setId && item.setId && definition.setId !== item.setId) warnings.push(`装备 ${item.ownedItemId} 套装与公共定义冲突：${item.setId} / ${definition.setId}`);
        if (item.enhanceLevel > definition.enhancementLimit) warnings.push(`装备 ${item.ownedItemId} 强化等级 ${item.enhanceLevel} 超过公共定义上限 ${definition.enhancementLimit}`);
      }
    }
  }
  for (const artifact of account.ownedArtifacts) {
    if (!artifactIds.has(artifact.artifactDefinitionId)) errors.push(`未知神器定义：${artifact.artifactDefinitionId}`);
    if (artifact.level != null && (!Number.isInteger(artifact.level) || artifact.level < 0 || artifact.level > 20)) errors.push(`神器 ${artifact.ownedArtifactId} 强化等级无效`);
    if (!Number.isInteger(artifact.refinement) || artifact.refinement < 0 || artifact.refinement > 5) errors.push(`神器 ${artifact.ownedArtifactId} 精炼等级无效`);
    const hasObserved = (Array.isArray(artifact.observedStats) && artifact.observedStats.length) || (artifact.stats && typeof artifact.stats === "object" && Object.keys(artifact.stats).length);
    if (artifact.level == null && !hasObserved) errors.push(`神器 ${artifact.ownedArtifactId} 既无强化等级也无观测属性`);
    else if (artifact.level == null) warnings.push(`神器 ${artifact.ownedArtifactId} 是旧版记录：计算采用观测属性，但无法与公共等级曲线核对`);
  }
  if (account.gameDataVersionId !== gameData.dataVersion.id) warnings.push(`文件数据版本 ${account.gameDataVersionId} 与当前 ${gameData.dataVersion.id} 不一致`);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function snapshotCounts(account) {
  return {
    heroes: account?.ownedHeroes?.length || 0,
    gear: account?.ownedGear?.length || 0,
    artifacts: account?.ownedArtifacts?.length || 0
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function sameRecord(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function diffAccountSnapshots(base, incoming) {
  const collections = {};
  for (const [name, definition] of Object.entries(COLLECTIONS)) {
    const before = new Map((base?.[definition.property] || []).map((entry) => [entry[definition.key], entry]));
    const after = new Map((incoming?.[definition.property] || []).map((entry) => [entry[definition.key], entry]));
    const added = [];
    const updated = [];
    const unchanged = [];
    const missingFromIncoming = [];
    for (const [id, record] of after) {
      if (!before.has(id)) added.push({ id, after: record });
      else if (sameRecord(before.get(id), record)) unchanged.push({ id });
      else updated.push({ id, before: before.get(id), after: record });
    }
    for (const [id, record] of before) if (!after.has(id)) missingFromIncoming.push({ id, before: record });
    collections[name] = { added, updated, unchanged, missingFromIncoming };
  }
  return {
    baseSnapshotId: base?.snapshotId || null,
    incomingSnapshotId: incoming?.snapshotId || null,
    sameGameDataVersion: base?.gameDataVersionId === incoming?.gameDataVersionId,
    collections,
    totals: Object.fromEntries(Object.entries(collections).map(([name, result]) => [name, {
      added: result.added.length,
      updated: result.updated.length,
      unchanged: result.unchanged.length,
      missingFromIncoming: result.missingFromIncoming.length
    }]))
  };
}

export function mergeAccountSnapshots(base, incoming, { preserveMissing = true, now = new Date() } = {}) {
  if (base.gameDataVersionId !== incoming.gameDataVersionId) {
    throw new Error(`不能合并不同公共数据版本：${base.gameDataVersionId} / ${incoming.gameDataVersionId}`);
  }
  const diff = diffAccountSnapshots(base, incoming);
  const merged = structuredClone(base);
  for (const definition of Object.values(COLLECTIONS)) {
    const before = new Map((base[definition.property] || []).map((entry) => [entry[definition.key], entry]));
    const after = new Map((incoming[definition.property] || []).map((entry) => [entry[definition.key], entry]));
    const ids = preserveMissing ? [...new Set([...before.keys(), ...after.keys()])] : [...after.keys()];
    merged[definition.property] = ids.map((id) => structuredClone(after.get(id) ?? before.get(id)));
  }
  merged.schemaVersion = "0.2.0";
  merged.snapshotId = `merged-${now.toISOString().replace(/[:.]/g, "-")}`;
  merged.createdAt = now.toISOString();
  merged.sourceMethod = "mixed";
  merged.warning = preserveMissing
    ? "由多个账号快照合并；新文件未出现的旧记录被保留，需结合采集覆盖报告判断是否已删除。"
    : "由账号快照合并；新文件未出现的旧记录未保留。";
  return { snapshot: merged, diff };
}
