import { DATA_KINDS, displayName, formatPublicStat, listPublicRecords, paginateRecords, reviewSummary } from "./data-browser-core.mjs";

const KIND_META = {
  heroes: { label: "角色", summary: "一级基础属性、成长候选、技能与证据质量" },
  equipment: { label: "装备", summary: "槽位、套装、强化上限与公共主属性曲线" },
  artifacts: { label: "神器", summary: "0–20 强化属性、0–5 精炼效果与限制" },
  sets: { label: "套装", summary: "套装成员、静态面板加成与未建模效果文本" }
};
const RARITY_LABELS = { common: "普通", rare: "稀有", epic: "史诗", legendary: "传说", mythic: "神话", special: "特殊", unknown: "未知" };
const SLOT_LABELS = { helmet: "头盔", weapon: "武器", chest: "胸甲", gloves: "手套", positive_rune: "正位符文", negative_rune: "负位符文" };
const state = { gameData: null, kind: "heroes", query: "", season: "all", rarity: "all", reviewOnly: false, page: 1, selectedId: null };
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function renderKindSwitch() {
  byId("kind-switch").innerHTML = DATA_KINDS.map((kind) => `<button class="kind-button" type="button" data-kind="${kind}" aria-current="${kind === state.kind}">${KIND_META[kind].label}</button>`).join("");
}

function renderFilterOptions() {
  const seasons = [...new Set(DATA_KINDS.flatMap((kind) => state.gameData[kind] || []).map((entry) => entry.season).filter(Boolean))].sort();
  byId("season-filter").innerHTML = `<option value="all">全部赛季</option>${seasons.map((season) => `<option value="${escapeHtml(season)}">${escapeHtml(season)}</option>`).join("")}`;
  const rarities = [...new Set([...(state.gameData.heroes || []), ...(state.gameData.equipment || []), ...(state.gameData.artifacts || [])].map((entry) => entry.rarity).filter(Boolean))];
  byId("rarity-filter").innerHTML = `<option value="all">全部品质</option>${rarities.map((rarity) => `<option value="${escapeHtml(rarity)}">${RARITY_LABELS[rarity] || escapeHtml(rarity)}</option>`).join("")}`;
}

function topStats(entry, kind) {
  if (kind === "heroes") return Object.entries(entry.baseStats || {}).slice(0, 3).map(([stat, value]) => formatPublicStat(stat, value, state.gameData.statDefinitions)).join(" · ");
  if (kind === "equipment" || kind === "artifacts") {
    const curve = entry.levelCurve?.at(-1)?.values || {};
    return Object.entries(curve).map(([stat, value]) => formatPublicStat(stat, value, state.gameData.statDefinitions)).join(" · ") || "无静态属性";
  }
  return `${entry.equipmentDefinitionIds?.length || 0} 件装备定义`;
}

function columns(kind) {
  if (kind === "heroes") return ["名称", "元素 / 品质", "赛季", "一级属性摘要", "证据状态"];
  if (kind === "equipment") return ["名称", "槽位 / 品质", "赛季", "满级主属性", "套装"];
  if (kind === "artifacts") return ["名称", "品质", "赛季", "+20 静态属性", "效果摘要"];
  return ["套装", "赛季", "类型", "成员数", "可执行加成"];
}

function rowCells(entry, kind) {
  const review = reviewSummary(state.gameData, entry, kind);
  const set = kind === "equipment" ? state.gameData.sets.find((item) => item.id === entry.setId) : null;
  if (kind === "heroes") return [displayName(entry), `${entry.element || "未知"} / ${RARITY_LABELS[entry.rarity] || entry.rarity || "未知"}`, entry.season || "—", topStats(entry, kind), review.text];
  if (kind === "equipment") return [displayName(entry), `${SLOT_LABELS[entry.slot] || "待核实"} / ${RARITY_LABELS[entry.rarity] || entry.rarity || "未知"}`, entry.season || "—", topStats(entry, kind), set ? displayName(set) : "散件 / 未知"];
  if (kind === "artifacts") return [displayName(entry), RARITY_LABELS[entry.rarity] || entry.rarity || "未知", entry.season || "—", topStats(entry, kind), entry.effectSummary || "—"];
  return [displayName(entry), entry.season || "—", entry.enhancedVariant ? "强化变体" : "普通", String(entry.equipmentDefinitionIds?.length || 0), entry.bonuses?.length ? `${entry.bonuses.length} 条` : "仅保留文本"];
}

function renderDetail(entry, kind) {
  if (!entry) {
    byId("catalog-detail").innerHTML = `<p class="empty-catalog">当前筛选没有记录。</p>`;
    return;
  }
  const review = reviewSummary(state.gameData, entry, kind);
  const statEntries = kind === "heroes" ? Object.entries(entry.baseStats || {}) : Object.entries(entry.levelCurve?.at(-1)?.values || {});
  const stats = statEntries.length ? `<div class="stat-lines">${statEntries.map(([stat, value]) => `<span>${escapeHtml(formatPublicStat(stat, value, state.gameData.statDefinitions))}</span>`).join("")}</div>` : `<p>没有可执行静态属性。</p>`;
  let domain = "";
  if (kind === "heroes") {
    const quality = state.gameData.heroDataQuality?.records?.find((item) => item.heroDefinitionId === entry.id);
    domain = `<div class="detail-section"><h3>角色信息</h3><p>元素：${escapeHtml(entry.element || "未知")} · 定位：${escapeHtml(entry.orientation || "未知")} · 攻击类型：${escapeHtml(entry.attackType || "未知")} · 品质：${escapeHtml(RARITY_LABELS[entry.rarity] || entry.rarity || "未知")}</p><p>比例成长风险：${escapeHtml(quality?.ratioGrowthStats?.join("、") || "无标记")}</p></div><div class="detail-section"><h3>技能（${entry.skills?.length || 0}）</h3><ul>${(entry.skills || []).slice(0, 5).map((skill) => `<li><strong>${escapeHtml(skill.name || skill.names?.en || "未命名技能")}</strong>${skill.description ? `：${escapeHtml(skill.description)}` : ""}</li>`).join("") || "<li>无技能文本</li>"}</ul></div>`;
  } else if (kind === "equipment") {
    const set = state.gameData.sets.find((item) => item.id === entry.setId);
    domain = `<div class="detail-section"><h3>装备信息</h3><p>槽位：${escapeHtml(SLOT_LABELS[entry.slot] || "待核实")} · 强化上限：${escapeHtml(entry.enhancementLimit ?? "未知")} · 套装：${escapeHtml(set ? displayName(set) : "散件 / 未知")}</p></div>`;
  } else if (kind === "artifacts") {
    const staticEffect = entry.staticEffectLevels?.find((level) => level.refinement === 0);
    domain = `<div class="detail-section"><h3>精炼 0 效果</h3><p>${escapeHtml(entry.effectSummary || "无效果文本")}</p>${staticEffect ? `<p>可执行常驻面板：${escapeHtml(Object.entries(staticEffect.values).map(([stat, value]) => formatPublicStat(stat, value, state.gameData.statDefinitions)).join("，"))}</p>` : `<p>当前保持文本态，不加入常驻面板。</p>`}<p>限制：${escapeHtml(entry.restrictions || "未记录")}</p></div>`;
  } else {
    domain = `<div class="detail-section"><h3>套装效果</h3><ul>${(entry.bonuses || []).map((bonus) => `<li>${escapeHtml(bonus.pieces)} 件：${escapeHtml(Object.entries(bonus.sheetStats || {}).map(([stat, value]) => formatPublicStat(stat, value, state.gameData.statDefinitions)).join("，") || bonus.rawText || "未建模")}</li>`).join("") || "<li>当前没有可执行静态加成</li>"}</ul></div>`;
  }
  const sourceUrl = entry.source?.url;
  byId("catalog-detail").innerHTML = `<h2>${escapeHtml(displayName(entry))}</h2><p class="catalog-id">${escapeHtml(entry.id)}${entry.externalId != null ? ` · external ${escapeHtml(entry.externalId)}` : ""}</p><p class="review-state ${review.tone}">${escapeHtml(review.text)}</p><div class="detail-section"><h3>${kind === "heroes" ? "一级基础属性" : kind === "sets" ? "成员摘要" : "满级静态属性"}</h3>${stats}</div>${domain}<div class="detail-section"><h3>来源</h3><p>${escapeHtml(entry.source?.sourceId || "未记录")} · ${escapeHtml(entry.source?.verification || "未验证")}</p>${sourceUrl ? `<p><a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a></p>` : ""}</div>`;
}

function render() {
  renderKindSwitch();
  const result = listPublicRecords(state.gameData, state);
  const pagination = paginateRecords(result.records, state.page, 50);
  state.page = pagination.page;
  if (!pagination.records.some((entry) => entry.id === state.selectedId)) state.selectedId = pagination.records[0]?.id || null;
  byId("catalog-title").textContent = KIND_META[state.kind].label;
  byId("catalog-summary").textContent = KIND_META[state.kind].summary;
  byId("catalog-head").innerHTML = columns(state.kind).map((label) => `<th scope="col">${label}</th>`).join("");
  byId("catalog-body").innerHTML = pagination.records.length ? pagination.records.map((entry) => `<tr tabindex="0" data-record-id="${escapeHtml(entry.id)}" aria-current="${entry.id === state.selectedId}">${rowCells(entry, state.kind).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty-catalog" colspan="5">当前筛选没有记录。</td></tr>`;
  byId("page-status").textContent = `第 ${pagination.page} / ${pagination.pageCount} 页 · ${pagination.total} 条`;
  byId("previous-page").disabled = pagination.page <= 1;
  byId("next-page").disabled = pagination.page >= pagination.pageCount;
  byId("catalog-counts").innerHTML = DATA_KINDS.map((kind) => `<div class="catalog-count"><strong>${state.gameData[kind]?.length || 0}</strong><span>${KIND_META[kind].label}</span></div>`).join("");
  renderDetail(result.records.find((entry) => entry.id === state.selectedId) || pagination.records[0], state.kind);
}

function resetAndRender() { state.page = 1; state.selectedId = null; render(); }

async function initialize() {
  try {
    state.gameData = await fetchJson("../data/game-data.public.json");
    byId("data-status").textContent = `离线 · ${state.gameData.dataVersion.id} · 未经客户端验证`;
    renderFilterOptions();
    render();
  } catch (error) {
    byId("data-status").textContent = "公共数据载入失败";
    byId("catalog-message").textContent = `${error.message}；请通过本地 HTTP 服务打开。`;
  }
}

byId("kind-switch").addEventListener("click", (event) => { const kind = event.target.closest("[data-kind]")?.dataset.kind; if (kind) { state.kind = kind; state.rarity = "all"; state.reviewOnly = false; byId("rarity-filter").value = "all"; byId("review-only").checked = false; resetAndRender(); } });
byId("catalog-query").addEventListener("input", (event) => { state.query = event.target.value; resetAndRender(); });
byId("season-filter").addEventListener("change", (event) => { state.season = event.target.value; resetAndRender(); });
byId("rarity-filter").addEventListener("change", (event) => { state.rarity = event.target.value; resetAndRender(); });
byId("review-only").addEventListener("change", (event) => { state.reviewOnly = event.target.checked; resetAndRender(); });
byId("previous-page").addEventListener("click", () => { state.page -= 1; state.selectedId = null; render(); });
byId("next-page").addEventListener("click", () => { state.page += 1; state.selectedId = null; render(); });
byId("catalog-body").addEventListener("click", (event) => { const row = event.target.closest("[data-record-id]"); if (row) { state.selectedId = row.dataset.recordId; render(); } });
byId("catalog-body").addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-record-id]")) { event.preventDefault(); state.selectedId = event.target.dataset.recordId; render(); } });

initialize();
