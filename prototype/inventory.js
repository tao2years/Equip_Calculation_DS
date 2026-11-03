import {
  INVENTORY_SESSION_KEY,
  createEmptySnapshot,
  formatStats,
  diffAccountSnapshots,
  mergeAccountSnapshots,
  nextOwnedId,
  parseStats,
  snapshotCounts,
  validateEditableSnapshot
} from "./inventory-core.mjs";
import { resolveArtifactStats } from "./optimizer-core.mjs";

const SLOT_LABELS = {
  helmet: "头盔", weapon: "武器", chest: "胸甲", gloves: "手套",
  positive_rune: "正位符文", negative_rune: "负位符文"
};
const state = { gameData: null, account: null };
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function heroName(definition) { return definition?.names?.zh || definition?.names?.en || definition?.id || "未知角色"; }
function artifactName(definition) { return definition?.names?.zh || definition?.names?.en || definition?.id || "未知神器"; }
function equipmentName(definition) { return definition?.names?.zh || definition?.names?.en || definition?.id || "未知装备"; }
function setName(setId) {
  const definition = state.gameData.sets.find((entry) => entry.id === setId);
  return definition?.names?.zh || definition?.names?.en || setId || "散件";
}

function showMessage(message, kind = "success") {
  const element = byId("editor-message");
  element.textContent = message;
  element.style.color = kind === "error" ? "var(--danger)" : kind === "warning" ? "var(--accent-light)" : "var(--success)";
}

function fillOptions() {
  const heroes = [...state.gameData.heroes].sort((a, b) => heroName(a).localeCompare(heroName(b), "zh-CN"));
  byId("hero-definition").innerHTML = heroes.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(heroName(entry))} · ${escapeHtml(entry.element || "?")} · ${escapeHtml(entry.season || "?")}</option>`).join("");
  const slots = state.gameData.slotDefinitions.filter((entry) => entry.id !== "artifact");
  byId("gear-slot").innerHTML = slots.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(SLOT_LABELS[entry.id] || entry.labelZh || entry.id)}</option>`).join("");
  const equipment = [...(state.gameData.equipment || [])].filter((entry) => entry.slot !== "unknown").sort((a, b) => equipmentName(a).localeCompare(equipmentName(b), "zh-CN"));
  byId("gear-definition").innerHTML = `<option value="">手工选择槽位与套装</option>` + equipment.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(equipmentName(entry))} · #${escapeHtml(entry.externalId || "?")} · ${escapeHtml(entry.rarity || "?")} · ${escapeHtml(entry.season || "?")}</option>`).join("");
  const sets = [...state.gameData.sets].sort((a, b) => setName(a.id).localeCompare(setName(b.id), "zh-CN"));
  byId("gear-set").innerHTML = `<option value="">散件 / 未知</option>` + sets.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.names.zh || entry.names.en || entry.id)} · ${escapeHtml(entry.season || "?")}</option>`).join("");
  const artifacts = [...state.gameData.artifacts].sort((a, b) => artifactName(a).localeCompare(artifactName(b), "zh-CN"));
  byId("artifact-definition").innerHTML = artifacts.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(artifactName(entry))} · ${escapeHtml(entry.rarity || "?")} · ${escapeHtml(entry.season || "?")}</option>`).join("");
}

function card({ title, id, detail, kind, itemId }) {
  return `<article class="inventory-card"><div><strong>${escapeHtml(title)}</strong><p class="item-id">${escapeHtml(id)}</p></div><div><p>${escapeHtml(detail)}</p></div><button class="delete-item" type="button" data-kind="${kind}" data-item-id="${escapeHtml(itemId)}">删除</button></article>`;
}

function render() {
  const counts = snapshotCounts(state.account);
  byId("inventory-counts").innerHTML = [
    [counts.heroes, "角色"], [counts.gear, "装备"], [counts.artifacts, "神器"]
  ].map(([value, label]) => `<div class="count-tile"><strong>${value}</strong><span>${label}</span></div>`).join("");
  byId("hero-count").textContent = counts.heroes;
  byId("gear-count").textContent = counts.gear;
  byId("artifact-count").textContent = counts.artifacts;
  byId("snapshot-meta").innerHTML = `<strong>${escapeHtml(state.account.snapshotId)}</strong><br>${escapeHtml(state.account.gameDataVersionId)}<br>来源：${escapeHtml(state.account.sourceMethod)}`;

  byId("hero-list").innerHTML = state.account.ownedHeroes.length ? state.account.ownedHeroes.map((owned) => {
    const definition = state.gameData.heroes.find((entry) => entry.id === owned.heroDefinitionId);
    return card({ title: heroName(definition), id: owned.ownedHeroId, detail: `等级 ${owned.level} · 星级 ${owned.stars ?? "?"} · 灵感 ${owned.inspiration ?? "?"}`, kind: "hero", itemId: owned.ownedHeroId });
  }).join("") : `<div class="empty-inventory">尚未添加角色</div>`;

  byId("gear-list").innerHTML = state.account.ownedGear.length ? state.account.ownedGear.map((item) => {
    const definition = item.definitionId ? state.gameData.equipment?.find((entry) => entry.id === item.definitionId) : null;
    return card({
      title: definition ? equipmentName(definition) : `${SLOT_LABELS[item.slot] || item.slot} · ${setName(item.setId)}`,
      id: item.ownedItemId,
      detail: `${SLOT_LABELS[item.slot] || item.slot} · ${setName(item.setId)} · 强化 +${item.enhanceLevel} · ${formatStats(item.stats, state.gameData.statDefinitions) || "无属性"}${definition ? " · 已关联公共定义" : ""}${item.locked ? " · 已锁定" : ""}`,
      kind: "gear", itemId: item.ownedItemId
    });
  }).join("") : `<div class="empty-inventory">尚未添加装备</div>`;

  byId("artifact-list").innerHTML = state.account.ownedArtifacts.length ? state.account.ownedArtifacts.map((owned) => {
    const definition = state.gameData.artifacts.find((entry) => entry.id === owned.artifactDefinitionId);
    const resolved = resolveArtifactStats(state.gameData, owned);
    const source = resolved.source === "public_level_curve" ? "公共曲线" : resolved.source === "account_observed" ? "账号观测" : resolved.source === "legacy_account_stats" ? "旧版观测" : "不可用";
    return card({ title: artifactName(definition), id: owned.ownedArtifactId, detail: `强化 +${owned.level ?? "?"} · 精炼 ${owned.refinement} · ${formatStats(resolved.stats, state.gameData.statDefinitions) || "无属性"} · ${source}${owned.locked ? " · 已锁定" : ""}`, kind: "artifact", itemId: owned.ownedArtifactId });
  }).join("") : `<div class="empty-inventory">尚未添加神器</div>`;
}

function loadAccount(account, message = "账号文件已载入") {
  const validation = validateEditableSnapshot(account, state.gameData);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  state.account = structuredClone(account);
  if (!state.account.schemaVersion) state.account.schemaVersion = "0.2.0";
  render();
  showMessage([message, ...validation.warnings].join("；"), validation.warnings.length ? "warning" : "success");
}

function renderDiff(diff, mode) {
  const element = byId("diff-summary");
  const labels = { heroes: "角色", gear: "装备", artifacts: "神器" };
  element.hidden = false;
  element.innerHTML = `<h2>${mode === "merge" ? "合并结果" : "替换差异"}</h2>` + Object.entries(diff.totals).map(([kind, totals]) =>
    `<p><strong>${labels[kind]}</strong>：新增 ${totals.added} · 更新 ${totals.updated} · 未变 ${totals.unchanged} · 本次未出现 ${totals.missingFromIncoming}</p>`
  ).join("") + `<p>${mode === "merge" ? "本次未出现的旧记录已保留，不等于确认仍在账号中。" : "当前账号已被新文件替换。"}</p>`;
}

function downloadAccount() {
  const validation = validateEditableSnapshot(state.account, state.gameData);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  state.account.createdAt = new Date().toISOString();
  const blob = new Blob([`${JSON.stringify(state.account, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.account.snapshotId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showMessage(`已导出 ${anchor.download}${validation.warnings.length ? `；${validation.warnings.join("；")}` : ""}`, validation.warnings.length ? "warning" : "success");
}

byId("hero-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const definitionId = byId("hero-definition").value;
    if (state.account.ownedHeroes.some((entry) => entry.heroDefinitionId === definitionId)) throw new Error("该角色已经在账号中");
    state.account.ownedHeroes.push({
      ownedHeroId: nextOwnedId("hero-manual", state.account.ownedHeroes, "ownedHeroId"),
      heroDefinitionId: definitionId,
      level: Number(byId("hero-level").value),
      stars: Number(byId("hero-stars").value) || null,
      inspiration: Number(byId("hero-inspiration").value) || 0
    });
    render(); showMessage("角色已添加");
  } catch (error) { showMessage(error.message, "error"); }
});

byId("gear-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const definitionId = byId("gear-definition").value || null;
    const definition = definitionId ? state.gameData.equipment.find((entry) => entry.id === definitionId) : null;
    state.account.ownedGear.push({
      ownedItemId: nextOwnedId("gear-manual", state.account.ownedGear, "ownedItemId"),
      definitionId,
      displayName: definition ? equipmentName(definition) : null,
      slot: definition?.slot || byId("gear-slot").value,
      rarity: definition?.rarity || "unknown",
      setId: definition?.setId || byId("gear-set").value || null,
      enhanceLevel: Number(byId("gear-level").value),
      stats: parseStats(byId("gear-stats").value, state.gameData.statDefinitions.map((entry) => entry.id)),
      equippedBy: null,
      locked: byId("gear-locked").checked,
      sourceConfidence: 1
    });
    byId("gear-stats").value = "";
    render(); showMessage("装备已添加");
  } catch (error) { showMessage(error.message, "error"); }
});

byId("gear-definition").addEventListener("change", () => {
  const definition = state.gameData.equipment?.find((entry) => entry.id === byId("gear-definition").value);
  if (!definition) {
    byId("gear-level").removeAttribute("max");
    showMessage("已切换为手工槽位/套装录入");
    return;
  }
  byId("gear-slot").value = definition.slot;
  byId("gear-set").value = definition.setId || "";
  byId("gear-level").max = String(definition.enhancementLimit);
  if (Number(byId("gear-level").value) > definition.enhancementLimit) byId("gear-level").value = definition.enhancementLimit;
  showMessage(`已关联 ${equipmentName(definition)}；槽位与套装已从公共定义带入`);
});

byId("artifact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const definitionId = byId("artifact-definition").value;
    if (state.account.ownedArtifacts.some((entry) => entry.artifactDefinitionId === definitionId)) throw new Error("该神器已经在账号中");
    const observed = parseStats(byId("artifact-stats").value, state.gameData.statDefinitions.map((entry) => entry.id));
    state.account.ownedArtifacts.push({
      ownedArtifactId: nextOwnedId("artifact-manual", state.account.ownedArtifacts, "ownedArtifactId"),
      artifactDefinitionId: definitionId,
      level: Number(byId("artifact-level").value),
      refinement: Number(byId("artifact-refinement").value),
      observedStats: Object.entries(observed).map(([stat, value]) => ({ stat, value, raw_text: null, confidence: 1 })),
      equippedBy: null,
      locked: byId("artifact-locked").checked
    });
    byId("artifact-stats").value = "";
    render(); showMessage("神器已添加");
  } catch (error) { showMessage(error.message, "error"); }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-item");
  if (!button) return;
  const collections = { hero: ["ownedHeroes", "ownedHeroId"], gear: ["ownedGear", "ownedItemId"], artifact: ["ownedArtifacts", "ownedArtifactId"] };
  const [collection, key] = collections[button.dataset.kind];
  state.account[collection] = state.account[collection].filter((entry) => entry[key] !== button.dataset.itemId);
  render(); showMessage("记录已删除");
});

byId("new-account").addEventListener("click", () => loadAccount(createEmptySnapshot(state.gameData.dataVersion.id), "已新建空账号"));
byId("load-example").addEventListener("click", async () => {
  try { loadAccount(await fetchJson("../examples/account-snapshot.example.json"), "示例账号已载入"); }
  catch (error) { showMessage(error.message, "error"); }
});
byId("account-file").addEventListener("change", async (event) => {
  try {
    const [file] = event.target.files;
    if (!file) return;
    const incoming = JSON.parse(await file.text());
    const validation = validateEditableSnapshot(incoming, state.gameData);
    if (validation.errors.length) throw new Error(validation.errors.join("；"));
    const mode = byId("import-mode").value;
    if (mode === "merge") {
      const merged = mergeAccountSnapshots(state.account, incoming);
      loadAccount(merged.snapshot, "账号文件已按稳定 ID 合并");
      renderDiff(merged.diff, mode);
    } else {
      const diff = diffAccountSnapshots(state.account, incoming);
      loadAccount(incoming, "账号文件已替换当前库存");
      renderDiff(diff, mode);
    }
  }
  catch (error) { showMessage(`导入失败：${error.message}`, "error"); }
  event.target.value = "";
});
byId("export-account").addEventListener("click", () => { try { downloadAccount(); } catch (error) { showMessage(error.message, "error"); } });
byId("use-in-optimizer").addEventListener("click", () => {
  const validation = validateEditableSnapshot(state.account, state.gameData);
  if (validation.errors.length) { showMessage(validation.errors.join("；"), "error"); return; }
  sessionStorage.setItem(INVENTORY_SESSION_KEY, JSON.stringify(state.account));
  location.href = "index.html?account=session";
});

async function initialize() {
  try {
    state.gameData = await fetchJson("../data/game-data.public.json");
    byId("data-status").textContent = `离线 · 数据版本 ${state.gameData.dataVersion.id}`;
    fillOptions();
    const saved = sessionStorage.getItem(INVENTORY_SESSION_KEY);
    loadAccount(saved ? JSON.parse(saved) : createEmptySnapshot(state.gameData.dataVersion.id), saved ? "已恢复本次会话账号" : "已创建空账号");
  } catch (error) {
    byId("data-status").textContent = "公共数据载入失败，请通过本地 HTTP 服务打开";
    showMessage(error.message, "error");
  }
}

initialize();
