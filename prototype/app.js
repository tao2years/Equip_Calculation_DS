import { SLOT_IDS, enumerateBuilds } from "./optimizer-core.mjs";
import { INVENTORY_SESSION_KEY } from "./inventory-core.mjs";

const SLOT_LABELS = {
  helmet: "头盔", weapon: "武器", chest: "胸甲", gloves: "手套",
  positive_rune: "正位符文", negative_rune: "负位符文"
};

const STAT_DEFINITIONS = [
  { id: "hp_sheet", label: "生命", unit: "flat" },
  { id: "atk_sheet", label: "攻击", unit: "flat" },
  { id: "def_sheet", label: "防御", unit: "flat" },
  { id: "crit_rate", label: "重击率", unit: "ratio" },
  { id: "crit_damage", label: "重击伤害", unit: "ratio" },
  { id: "accuracy", label: "效果命中", unit: "flat" },
  { id: "resistance", label: "效果抵抗", unit: "flat" },
  { id: "enlightenment", label: "精通", unit: "flat" },
  { id: "skill_haste", label: "技能急速", unit: "flat" },
  { id: "attack_speed_pct", label: "攻击速度", unit: "ratio" }
];

const DEFAULT_CONSTRAINTS = [
  { stat: "crit_rate", op: ">=", value: 100 },
  { stat: "atk_sheet", op: ">=", value: 500 },
  { stat: "hp_sheet", op: ">=", value: 7000 },
  { stat: "accuracy", op: ">=", value: 0 }
];

const state = {
  gameData: null,
  account: null,
  results: [],
  selectedResult: 0,
  solver: null
};

const byId = (id) => document.getElementById(id);
const formatInt = (value) => Math.round(value || 0).toLocaleString("zh-CN");
const formatPct = (value) => `${((value || 0) * 100).toFixed(1)}%`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function initialize() {
  try {
    state.gameData = await fetchJson("../data/game-data.public.json");
    byId("data-status").textContent = `离线 · 数据版本 ${state.gameData.dataVersion.id}`;
    renderHeroOptions();
    const sessionAccount = sessionStorage.getItem(INVENTORY_SESSION_KEY);
    if (sessionAccount) loadAccount(JSON.parse(sessionAccount));
  } catch (error) {
    byId("data-status").textContent = "公共数据载入失败，请通过本地 HTTP 服务打开";
    showMessage(error.message);
  }
}

function renderHeroOptions() {
  const select = byId("hero-select");
  select.innerHTML = "";
  const owned = state.account?.ownedHeroes || [];
  for (const entry of owned) {
    const hero = state.gameData.heroes.find((item) => item.id === entry.heroDefinitionId);
    if (!hero) continue;
    const option = document.createElement("option");
    option.value = entry.ownedHeroId;
    option.textContent = hero.names.zh || hero.names.en;
    select.append(option);
  }
  if (!owned.length) {
    const option = document.createElement("option");
    option.textContent = "请先导入账号";
    option.value = "";
    select.append(option);
  }
  renderArtifactOptions();
  renderFixedSlots();
}

function getSelectedOwnedHero() {
  return state.account?.ownedHeroes.find((item) => item.ownedHeroId === byId("hero-select").value) || null;
}

function getHeroDefinition(ownedHero = getSelectedOwnedHero()) {
  return state.gameData?.heroes.find((item) => item.id === ownedHero?.heroDefinitionId) || null;
}

function renderArtifactOptions() {
  const select = byId("artifact-select");
  select.innerHTML = "";
  const hero = getHeroDefinition();
  for (const owned of state.account?.ownedArtifacts || []) {
    const definition = state.gameData.artifacts.find((item) => item.id === owned.artifactDefinitionId);
    if (!definition) continue;
    const allowed = !definition.restrictions?.heroIds || definition.restrictions.heroIds.includes(hero?.id);
    if (!allowed) continue;
    const option = document.createElement("option");
    option.value = owned.ownedArtifactId;
    option.textContent = `${definition.names.zh || definition.names.en} · 强化+${owned.level ?? "?"} · 精炼${owned.refinement}`;
    select.append(option);
  }
}

function renderFixedSlots() {
  const container = byId("fixed-slots");
  container.innerHTML = "";
  for (const slot of SLOT_IDS) {
    const label = document.createElement("label");
    label.className = "field";
    label.innerHTML = `<span>${SLOT_LABELS[slot]}</span>`;
    const select = document.createElement("select");
    select.dataset.slot = slot;
    select.innerHTML = `<option value="">自动选择</option>`;
    for (const item of state.account?.ownedGear.filter((entry) => entry.slot === slot) || []) {
      const option = document.createElement("option");
      option.value = item.ownedItemId;
      option.textContent = `${item.ownedItemId}${item.setId ? ` · ${setName(item.setId)}` : ""}`;
      select.append(option);
    }
    label.append(select);
    container.append(label);
  }
}

function setName(setId) {
  const set = state.gameData?.sets.find((entry) => entry.id === setId);
  return set?.names.zh || set?.names.en || setId || "散件";
}

function renderAccountSummary() {
  const el = byId("account-summary");
  if (!state.account) {
    el.textContent = "尚未导入账号文件";
    return;
  }
  el.innerHTML = `<strong>${escapeHtml(state.account.snapshotId)}</strong><br>` +
    `${state.account.ownedHeroes.length} 个角色 · ${state.account.ownedGear.length} 件装备 · ${state.account.ownedArtifacts.length} 件神器<br>` +
    `来源：${escapeHtml(state.account.sourceMethod)}`;
}

function validateAccount(account) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(account.ownedHeroes)) errors.push("缺少 ownedHeroes 数组");
  if (!Array.isArray(account.ownedGear)) errors.push("缺少 ownedGear 数组");
  if (!Array.isArray(account.ownedArtifacts)) errors.push("缺少 ownedArtifacts 数组");
  for (const item of account.ownedGear || []) {
    if (!SLOT_IDS.includes(item.slot)) errors.push(`装备 ${item.ownedItemId || "?"} 槽位无效`);
    if (!item.ownedItemId || !item.stats) errors.push("装备缺少 ownedItemId 或 stats");
    if (item.setId && !state.gameData.sets.some((set) => set.id === item.setId)) warnings.push(`装备 ${item.ownedItemId} 使用未知套装 ${item.setId}`);
    if (item.definitionId && !state.gameData.equipment?.some((entry) => entry.id === item.definitionId)) errors.push(`装备 ${item.ownedItemId} 使用未知公共定义 ${item.definitionId}`);
  }
  for (const hero of account.ownedHeroes || []) {
    if (!state.gameData.heroes.some((entry) => entry.id === hero.heroDefinitionId)) errors.push(`未知角色定义 ${hero.heroDefinitionId}`);
  }
  for (const artifact of account.ownedArtifacts || []) {
    if (!state.gameData.artifacts.some((entry) => entry.id === artifact.artifactDefinitionId)) errors.push(`未知神器定义 ${artifact.artifactDefinitionId}`);
    const hasObserved = (Array.isArray(artifact.observedStats) && artifact.observedStats.length) || (artifact.stats && Object.keys(artifact.stats).length);
    if (artifact.level == null && !hasObserved) errors.push(`神器 ${artifact.ownedArtifactId} 缺少强化等级和观测属性`);
    else if (artifact.level == null) warnings.push(`神器 ${artifact.ownedArtifactId} 为旧版观测记录，无法核对公共等级曲线`);
  }
  if (account.gameDataVersionId !== state.gameData.dataVersion.id) {
    warnings.push(`账号文件数据版本 ${account.gameDataVersionId} 与当前 ${state.gameData.dataVersion.id} 不一致`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function loadAccount(account) {
  const validation = validateAccount(account);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  state.account = account;
  state.results = [];
  renderHeroOptions();
  renderAccountSummary();
  renderEmpty("账号已导入，请设置条件并开始计算");
  const messages = [account.warning, ...validation.warnings].filter(Boolean);
  showMessage(messages.join("；"), messages.length ? "warning" : "success");
}

function fixedSelection() {
  const result = {};
  document.querySelectorAll("#fixed-slots select").forEach((select) => {
    if (select.value) result[select.dataset.slot] = select.value;
  });
  return result;
}

function candidatePolicyFromUi() {
  const equipped = byId("equipped-policy").value;
  return {
    equippedItems: equipped === "selected_hero" ? "selected_heroes" : equipped,
    allowedOwnerIds: equipped === "selected_hero" ? [byId("hero-select").value] : [],
    respectItemLocks: byId("respect-locks").checked
  };
}

function statDefinition(statId) {
  return STAT_DEFINITIONS.find((entry) => entry.id === statId) || { id: statId, label: statId, unit: "flat" };
}

function addConstraintRow(constraint = { stat: "atk_sheet", op: ">=", value: 0 }) {
  const row = document.createElement("div");
  row.className = "constraint-row";
  const statSelect = document.createElement("select");
  statSelect.className = "constraint-stat";
  statSelect.setAttribute("aria-label", "约束属性");
  for (const definition of STAT_DEFINITIONS) {
    const option = document.createElement("option");
    option.value = definition.id;
    option.textContent = definition.label;
    option.selected = definition.id === constraint.stat;
    statSelect.append(option);
  }
  const opSelect = document.createElement("select");
  opSelect.className = "constraint-op";
  opSelect.setAttribute("aria-label", "比较符号");
  for (const operator of [">=", ">", "<=", "<", "="]) {
    const option = document.createElement("option");
    option.value = operator;
    option.textContent = operator.replace(">=", "≥").replace("<=", "≤");
    option.selected = operator === constraint.op;
    opSelect.append(option);
  }
  const input = document.createElement("input");
  input.className = "constraint-value";
  input.type = "number";
  input.step = "any";
  input.value = String(constraint.value);
  input.setAttribute("aria-label", "约束数值");
  const unit = document.createElement("span");
  unit.className = "constraint-unit";
  const updateUnit = () => { unit.textContent = statDefinition(statSelect.value).unit === "ratio" ? "%" : "数值"; };
  statSelect.addEventListener("change", updateUnit);
  updateUnit();
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "constraint-remove";
  remove.setAttribute("aria-label", "删除条件");
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());
  row.append(statSelect, opSelect, input, unit, remove);
  byId("constraint-list").append(row);
}

function initializeConstraints() {
  byId("constraint-list").replaceChildren();
  DEFAULT_CONSTRAINTS.forEach(addConstraintRow);
}

function constraintsFromUi() {
  return [...document.querySelectorAll(".constraint-row")].map((row, index) => {
    const stat = row.querySelector(".constraint-stat").value;
    const rawValue = Number(row.querySelector(".constraint-value").value);
    if (!Number.isFinite(rawValue)) throw new Error(`第 ${index + 1} 个条件不是有效数值`);
    return {
      stat,
      op: row.querySelector(".constraint-op").value,
      value: statDefinition(stat).unit === "ratio" ? rawValue / 100 : rawValue,
      layer: "sheet"
    };
  });
}

function objectiveFromUi() {
  const value = byId("objective-select").value;
  const direction = byId("objective-direction").value;
  if (value === "weighted_stats") {
    const weights = {};
    for (const input of document.querySelectorAll(".objective-weight")) {
      const rawWeight = Number(input.value);
      if (!Number.isFinite(rawWeight)) throw new Error(`${input.dataset.label}权重不是有效数值`);
      if (!rawWeight) continue;
      const definition = statDefinition(input.dataset.stat);
      weights[definition.id] = definition.unit === "ratio" ? rawWeight * 100 : rawWeight;
    }
    if (!Object.keys(weights).length) throw new Error("自定义加权目标至少需要一个非零权重");
    return { kind: "weighted_stats", direction, weights };
  }
  return value === "crit_proxy" ? { kind: "crit_proxy", direction } : { kind: "single_stat", stat: value, direction };
}

function initializeWeightedObjective() {
  byId("weight-grid").innerHTML = STAT_DEFINITIONS.map((definition) => `
    <label class="weight-field">
      <span>${escapeHtml(definition.label)}${definition.unit === "ratio" ? "（每 1%）" : ""}</span>
      <input class="objective-weight" data-stat="${escapeHtml(definition.id)}" data-label="${escapeHtml(definition.label)}" type="number" step="any" value="0" inputmode="decimal">
    </label>`).join("");
  const attack = document.querySelector('.objective-weight[data-stat="atk_sheet"]');
  const critDamage = document.querySelector('.objective-weight[data-stat="crit_damage"]');
  attack.value = "1";
  critDamage.value = "10";
}

function updateObjectiveEditor() {
  byId("weighted-objective").hidden = byId("objective-select").value !== "weighted_stats";
}

function runOptimization() {
  if (!state.account || !state.gameData) throw new Error("请先载入公共数据和账号文件");
  const constraints = constraintsFromUi();
  const outcome = enumerateBuilds({
    gameData: state.gameData,
    account: state.account,
    ownedHeroId: byId("hero-select").value,
    artifactId: byId("artifact-select").value,
    fixed: fixedSelection(),
    candidatePolicy: candidatePolicyFromUi(),
    constraints,
    objective: objectiveFromUi(),
    limit: 20,
    solverMode: byId("solver-mode").value
  });
  state.results = outcome.results;
  state.selectedResult = 0;
  state.solver = outcome.solver;
  renderResults(outcome, constraints);
}

function constraintFailure(constraint, maxima, minima) {
  const definition = statDefinition(constraint.stat);
  const format = (value) => definition.unit === "ratio" ? formatPct(value) : formatInt(value);
  if ((constraint.op === ">=" || constraint.op === ">") && maxima[constraint.stat] < constraint.value) return `${definition.label}理论最高 ${format(maxima[constraint.stat])}`;
  if ((constraint.op === "<=" || constraint.op === "<") && minima[constraint.stat] > constraint.value) return `${definition.label}理论最低 ${format(minima[constraint.stat])}`;
  if (constraint.op === "=" && (constraint.value < minima[constraint.stat] || constraint.value > maxima[constraint.stat])) return `${definition.label}可达范围 ${format(minima[constraint.stat])}–${format(maxima[constraint.stat])}`;
  return null;
}

function formatObjectiveScore(result) {
  const objectiveId = byId("objective-select").value;
  const value = result.objectiveScore ?? result.score;
  if (objectiveId === "weighted_stats") return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  return objectiveId !== "crit_proxy" && statDefinition(objectiveId).unit === "ratio" ? formatPct(value) : formatInt(value);
}

function renderResults(outcome, constraints) {
  const { searched, validCount, maxima, minima, solver } = outcome;
  const body = byId("result-body");
  body.innerHTML = "";
  if (solver?.mode === "heuristic_candidate_cap") {
    byId("search-summary").textContent = `快速启发式 · 候选空间 ${solver.searchSpace.toLocaleString("zh-CN")} → ${solver.reducedSearchSpace.toLocaleString("zh-CN")} · 结果不保证全局最高`;
  } else if (solver?.mode === "branch_and_bound") {
    const countLabel = solver.validCountExact ? `${validCount.toLocaleString("zh-CN")} 套满足` : `至少 ${validCount.toLocaleString("zh-CN")} 套满足`;
    byId("search-summary").textContent = `精确分支定界 · 评估 ${searched.toLocaleString("zh-CN")} / ${solver.searchSpace.toLocaleString("zh-CN")} 套 · ${countLabel} · Top N 全局精确`;
  } else {
    byId("search-summary").textContent = `精确枚举 ${searched.toLocaleString("zh-CN")} 套 · ${validCount.toLocaleString("zh-CN")} 套满足条件`;
  }
  if (!state.results.length) {
    if (solver?.mode === "heuristic_candidate_cap") {
      renderEmpty("缩减后的候选集中没有可行方案；这不能证明完整背包无解，请切换“全局精确 Top N”或放宽条件", true);
      byId("detail-content").innerHTML = "<p>快速启发式模式没有覆盖完整候选集，因此不会把本次空结果表述为全局无解。</p>";
      return;
    }
    const gaps = constraints.map((constraint) => constraintFailure(constraint, maxima, minima)).filter(Boolean);
    renderEmpty(gaps.length ? `没有方案满足全部条件：${gaps.join("；")}` : "没有方案同时满足这些条件；请减少固定项或放宽多个约束", true);
    const proof = solver?.mode === "branch_and_bound" ? "安全上下界已证明当前约束不可行。" : "系统已完成全量枚举。";
    byId("detail-content").innerHTML = `<p>${proof} 没有把“无结果”误报为计算失败。</p>`;
    return;
  }

  state.results.forEach((result, index) => {
    const row = document.createElement("tr");
    if (index === state.selectedResult) row.classList.add("selected");
    row.innerHTML = `<td>${index + 1}</td><td>${formatObjectiveScore(result)}</td><td>${formatInt(result.stats.atk_sheet)}</td>` +
      `<td>${formatInt(result.stats.hp_sheet)}</td><td>${formatInt(result.stats.def_sheet)}</td><td>${formatPct(result.stats.crit_rate)}</td>` +
      `<td>${formatPct(result.stats.crit_damage)}</td><td>${formatInt(result.stats.accuracy)}</td>` +
      `<td>${escapeHtml(result.setLabels.join(" + ") || "散件")}</td>`;
    row.addEventListener("click", () => {
      state.selectedResult = index;
      body.querySelectorAll("tr").forEach((entry) => entry.classList.remove("selected"));
      row.classList.add("selected");
      renderDetail(result, index);
    });
    body.append(row);
  });
  renderDetail(state.results[0], 0);
}

function renderDetail(result, index) {
  const stats = STAT_DEFINITIONS.map((definition) => `<li>${escapeHtml(definition.label)}：${definition.unit === "ratio" ? formatPct(result.stats[definition.id]) : formatInt(result.stats[definition.id])}</li>`).join("");
  const selectedHeroId = byId("hero-select").value;
  const currentBySlot = new Map((state.account?.ownedGear || []).filter((item) => item.equippedBy === selectedHeroId).map((item) => [item.slot, item]));
  const ownerLabel = (item) => {
    if (!item.equippedBy) return "背包";
    const owner = state.account.ownedHeroes.find((entry) => entry.ownedHeroId === item.equippedBy);
    const definition = state.gameData.heroes.find((entry) => entry.id === owner?.heroDefinitionId);
    return definition?.names.zh || definition?.names.en || item.equippedBy;
  };
  const swaps = result.gear.map((item) => {
    const current = currentBySlot.get(item.slot);
    if (current?.ownedItemId === item.ownedItemId) return `<li>${SLOT_LABELS[item.slot]}：保留 ${escapeHtml(item.ownedItemId)}</li>`;
    return `<li>${SLOT_LABELS[item.slot]}：${escapeHtml(current?.ownedItemId || "空")} → ${escapeHtml(item.ownedItemId)}（${escapeHtml(ownerLabel(item))}）</li>`;
  }).join("");
  byId("detail-title").textContent = `方案详情（排名 ${index + 1}）`;
  const solverNote = state.solver?.mode === "heuristic_candidate_cap"
    ? "快速启发式：只在缩减候选集内排序，不保证这是完整背包的全局最高。"
    : state.solver?.mode === "branch_and_bound" ? "精确分支定界：该 Top N 排名对完整候选空间全局精确。" : "完整枚举：排名、满足数量和极值均为精确值。";
  byId("detail-content").innerHTML = `
    <div class="formula-warning">${escapeHtml(solverNote)}</div>
    <div class="detail-block"><h3>装备 ID</h3><ul>${result.gear.map((item) => `<li>${SLOT_LABELS[item.slot]}：${escapeHtml(item.ownedItemId)}</li>`).join("")}</ul></div>
    <div class="detail-block"><h3>完整面板</h3><ul>${stats}</ul></div>
    <div class="detail-block"><h3>套装与神器</h3><ul><li>神器：${escapeHtml(result.artifact.ownedArtifactId)}（${escapeHtml(result.artifactStatSource)}）</li><li>${result.setLabels.map(escapeHtml).join("</li><li>") || "无激活套装"}</li></ul><p>角色基础：${escapeHtml(result.heroBaseSource)}</p>${result.artifactStatWarnings?.length ? `<p>${result.artifactStatWarnings.map(escapeHtml).join("；")}</p>` : ""}</div>
    <div class="detail-block"><h3>换装清单</h3><ul>${swaps}</ul></div>`;
}

function renderEmpty(message, preserveSummary = false) {
  byId("result-body").innerHTML = `<tr class="empty-row"><td colspan="9">${escapeHtml(message)}</td></tr>`;
  if (!preserveSummary) byId("search-summary").textContent = "等待计算";
}

function showMessage(message, kind = "error") {
  const el = byId("validation-message");
  el.textContent = message;
  el.style.color = kind === "success" ? "var(--success)" : kind === "warning" ? "var(--accent-light)" : "var(--danger)";
}

function friendlyError(error) {
  const message = error?.message || String(error);
  const noCandidate = message.match(/^No candidate gear for (.+)$/);
  if (noCandidate) return `候选范围内没有${SLOT_LABELS[noCandidate[1]] || noCandidate[1]}装备；请放宽穿戴/锁定过滤，或固定一件该槽位装备。`;
  return message;
}

byId("load-example").addEventListener("click", async () => {
  try {
    loadAccount(await fetchJson("../examples/account-snapshot.example.json"));
  } catch (error) { showMessage(error.message); }
});

byId("account-file").addEventListener("change", async (event) => {
  try {
    const [file] = event.target.files;
    if (!file) return;
    loadAccount(JSON.parse(await file.text()));
  } catch (error) { showMessage(`导入失败：${error.message}`); }
  event.target.value = "";
});

byId("hero-select").addEventListener("change", () => {
  renderArtifactOptions();
  state.results = [];
  renderEmpty("角色已切换，请重新计算");
});

byId("calculate").addEventListener("click", () => {
  try {
    showMessage("", "success");
    runOptimization();
  } catch (error) {
    const message = friendlyError(error);
    state.results = [];
    renderEmpty(`计算未执行：${message}`);
    byId("search-summary").textContent = "计算未执行";
    byId("detail-content").innerHTML = `<p>${escapeHtml(message)}</p>`;
    showMessage(message);
  }
});

byId("add-constraint").addEventListener("click", () => addConstraintRow());
byId("objective-select").addEventListener("change", updateObjectiveEditor);

initializeConstraints();
initializeWeightedObjective();
updateObjectiveEditor();

initialize();
