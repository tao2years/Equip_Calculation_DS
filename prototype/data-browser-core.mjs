export const DATA_KINDS = ["heroes", "equipment", "artifacts", "sets"];

export function displayName(entry) {
  return entry?.names?.zh || entry?.names?.en || entry?.names?.raw || entry?.id || "未命名";
}

function searchText(entry, kind, gameData) {
  const setName = kind === "equipment" && entry.setId
    ? displayName((gameData.sets || []).find((set) => set.id === entry.setId))
    : "";
  return [
    entry.id,
    entry.externalId,
    entry.names?.zh,
    entry.names?.en,
    entry.names?.raw,
    entry.element,
    entry.slot,
    entry.rarity,
    entry.season,
    setName,
    entry.effectSummary
  ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
}

export function listPublicRecords(gameData, filters = {}) {
  const kind = DATA_KINDS.includes(filters.kind) ? filters.kind : "heroes";
  const query = String(filters.query || "").trim().toLocaleLowerCase("zh-CN");
  const qualityByHero = new Map((gameData.heroDataQuality?.records || []).map((entry) => [entry.heroDefinitionId, entry]));
  let records = [...(gameData[kind] || [])];
  if (query) records = records.filter((entry) => searchText(entry, kind, gameData).includes(query));
  if (filters.season && filters.season !== "all") records = records.filter((entry) => entry.season === filters.season);
  if (filters.rarity && filters.rarity !== "all") records = records.filter((entry) => entry.rarity === filters.rarity);
  if (filters.reviewOnly) {
    records = kind === "heroes"
      ? records.filter((entry) => qualityByHero.get(entry.id)?.requiresObservedBaseStats)
      : records.filter((entry) => kind === "equipment" && (!entry.slot || !entry.setId));
  }
  records.sort((left, right) => displayName(left).localeCompare(displayName(right), "zh-CN", { numeric: true }));
  return { kind, records };
}

export function paginateRecords(records, page = 1, pageSize = 50) {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(records.length / safeSize));
  const safePage = Math.min(pageCount, Math.max(1, Math.floor(page)));
  return {
    page: safePage,
    pageCount,
    total: records.length,
    records: records.slice((safePage - 1) * safeSize, safePage * safeSize)
  };
}

export function formatPublicStat(stat, value, statDefinitions = []) {
  const definition = statDefinitions.find((entry) => entry.id === stat);
  const label = definition?.labelZh || stat;
  if (!Number.isFinite(value)) return `${label} —`;
  if (definition?.unit === "ratio" || stat.endsWith("_pct") || stat === "crit_rate" || stat === "crit_damage") {
    return `${label} ${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${label} ${Number(value.toFixed(2)).toLocaleString("zh-CN")}`;
}

export function reviewSummary(gameData, entry, kind) {
  if (kind === "heroes") {
    const quality = (gameData.heroDataQuality?.records || []).find((item) => item.heroDefinitionId === entry.id);
    if (quality?.requiresObservedBaseStats) return { tone: "danger", text: `需账号实测 · ${quality.anomalyFlags.join(" / ")}` };
    if (quality?.evidenceStatus === "independent_detail_crosschecked") return { tone: "success", text: "独立详情页交叉校验通过" };
    return { tone: "warning", text: "单一公共目录证据" };
  }
  if (kind === "equipment" && !entry.slot) return { tone: "danger", text: "装备槽位待核实" };
  return { tone: "warning", text: "公共目录已编译，未经过客户端验证" };
}
