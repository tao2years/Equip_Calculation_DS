const state = {
  bundle: null,
  selectedIndex: 0,
  imageUrls: new Map(),
  zoom: 1,
  filter: "all",
  showAllLines: false
};

const element = Object.fromEntries([
  "recognition-file", "image-files", "load-example", "job-progress", "total-count", "accepted-count", "pending-count",
  "rejected-count", "source-language", "shot-list", "selected-name", "previous", "next", "canvas-stage", "preview-image",
  "overlay-layer", "canvas-empty", "zoom-out", "zoom-in", "zoom-value", "fit-view", "show-all-lines", "capture-type",
  "field-list", "reject-image", "accept-image", "export-review", "engine-status", "hash-status", "status-message"
].map((id) => [id, document.getElementById(id)]));

function setStatus(message, isError = false) {
  element["status-message"].textContent = message;
  element["status-message"].style.color = isError ? "var(--danger)" : "var(--accent-light)";
}

function basename(value) {
  return String(value || "").replaceAll("\\", "/").split("/").pop();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function isRecognitionBundle(value) {
  return value?.schemaVersion === "0.1.0" && typeof value.jobId === "string" && Array.isArray(value.images);
}

function hydrateBundle(bundle) {
  if (!isRecognitionBundle(bundle)) throw new Error("文件不是受支持的 OCR recognition bundle");
  bundle.images.forEach((image) => {
    image.reviewStatus ||= "pending";
    image.captureType ||= "unclassified";
    image.review = image.review || {};
    for (const detection of image.detections || []) {
      const key = String(detection.lineIndex);
      if (!image.review[key]) {
        const candidates = detection.matches || [];
        image.review[key] = {
          rawText: detection.text,
          kind: candidates.length === 1 ? candidates[0].kind : "unresolved",
          selectedId: candidates.length === 1 ? candidates[0].id : null,
          status: candidates.length === 1 ? "matched" : "unresolved"
        };
      }
    }
  });
  return bundle;
}

function selectedImage() {
  return state.bundle?.images?.[state.selectedIndex] || null;
}

function counts() {
  const images = state.bundle?.images || [];
  return {
    total: images.length,
    accepted: images.filter((image) => image.reviewStatus === "accepted").length,
    rejected: images.filter((image) => image.reviewStatus === "rejected").length,
    pending: images.filter((image) => image.reviewStatus === "pending").length
  };
}

function renderSummary() {
  const summary = counts();
  element["total-count"].textContent = `${summary.total} 张`;
  element["accepted-count"].textContent = `${summary.accepted} 张`;
  element["pending-count"].textContent = `${summary.pending} 张`;
  element["rejected-count"].textContent = `${summary.rejected} 张`;
  element["job-progress"].textContent = state.bundle ? `${summary.total} 张截图 · ${summary.pending} 待确认` : "尚未载入识别任务";
  element["source-language"].textContent = state.bundle?.language || "—";
  element["engine-status"].textContent = state.bundle ? `${state.bundle.engine} · ${state.bundle.language}` : "Windows OCR · —";
}

function statusLabel(status) {
  return status === "accepted" ? "已接受" : status === "rejected" ? "已驳回" : "待确认";
}

function renderShotList() {
  const images = state.bundle?.images || [];
  if (!images.length) {
    element["shot-list"].innerHTML = '<p class="empty-state">载入识别清单后开始校对</p>';
    return;
  }
  element["shot-list"].replaceChildren(...images.map((image, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `shot-row${index === state.selectedIndex ? " selected" : ""}`;
    button.innerHTML = `<span class="shot-number">${String(image.sequence).padStart(2, "0")}</span><span class="shot-name"></span><span class="shot-status ${image.reviewStatus}">${statusLabel(image.reviewStatus)}</span>`;
    button.querySelector(".shot-name").textContent = image.originalName;
    button.addEventListener("click", () => selectImage(index));
    return button;
  }));
}

function resolveImageUrl(image) {
  if (!image) return null;
  return state.imageUrls.get(image.originalName) || state.imageUrls.get(basename(image.imageLocalPath)) || image.exampleImageUrl || null;
}

function renderPreview() {
  const image = selectedImage();
  element["selected-name"].textContent = image?.originalName || "未选择截图";
  element["hash-status"].textContent = image ? `原图 SHA-256 · ${image.imageSha256.slice(0, 12)}… 已记录` : "原图 SHA-256 尚未载入";
  element["capture-type"].value = image?.captureType || "unclassified";
  const url = resolveImageUrl(image);
  if (url) {
    element["preview-image"].src = url;
    element["canvas-stage"].classList.add("has-image");
  } else {
    element["preview-image"].removeAttribute("src");
    element["canvas-stage"].classList.remove("has-image");
    element["canvas-empty"].textContent = image ? `请通过“关联原图”选择 ${image.originalName}` : "请载入示例，或载入识别清单并关联原图";
  }
  element["canvas-stage"].style.transform = `scale(${state.zoom})`;
  element["zoom-value"].textContent = `${Math.round(state.zoom * 100)}%`;
  renderOverlays();
}

function statusForDetection(image, detection) {
  const review = image.review?.[String(detection.lineIndex)];
  if (review?.status === "matched" && review.selectedId) return "matched";
  return (detection.matches || []).length > 1 ? "ambiguous" : "unmatched";
}

function createBox(rect, className, lineIndex) {
  const image = selectedImage();
  if (!rect || !image) return null;
  const box = document.createElement("button");
  box.type = "button";
  box.className = `ocr-box ${className}`;
  box.style.left = `${rect.x / image.width * 100}%`;
  box.style.top = `${rect.y / image.height * 100}%`;
  box.style.width = `${rect.width / image.width * 100}%`;
  box.style.height = `${rect.height / image.height * 100}%`;
  box.dataset.lineIndex = lineIndex;
  box.tabIndex = -1;
  return box;
}

function renderOverlays() {
  const image = selectedImage();
  if (!image) return element["overlay-layer"].replaceChildren();
  const boxes = [];
  const detectedLines = new Set();
  for (const detection of image.detections || []) {
    detectedLines.add(detection.lineIndex);
    const box = createBox(detection.boundingRect, statusForDetection(image, detection), detection.lineIndex);
    if (box) boxes.push(box);
  }
  if (state.showAllLines) {
    for (const line of image.lines || []) {
      if (detectedLines.has(line.lineIndex)) continue;
      const box = createBox(line.boundingRect, "unmatched", line.lineIndex);
      if (box) boxes.push(box);
    }
  }
  element["overlay-layer"].replaceChildren(...boxes);
}

function candidateOptions(detection, selectedId) {
  const options = [{ value: "", label: "未解决 / 不采用" }];
  for (const match of detection.matches || []) options.push({ value: match.id, label: `${match.kind} · ${match.alias}` });
  return options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedId ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderFields() {
  const image = selectedImage();
  if (!image?.detections?.length) {
    element["field-list"].innerHTML = '<p class="empty-state">本图没有字典命中；请检查全部 OCR 行或更换截图</p>';
    return;
  }
  const cards = image.detections.filter((detection) => {
    if (state.filter === "all") return true;
    const status = statusForDetection(image, detection);
    return state.filter === "matched" ? status === "matched" : status !== "matched";
  }).map((detection) => {
    const review = image.review[String(detection.lineIndex)];
    const status = statusForDetection(image, detection);
    const card = document.createElement("article");
    card.className = `field-card ${status === "matched" ? "" : status === "ambiguous" ? "ambiguous" : "unresolved"}`;
    const confidence = detection.matches?.length === 1 ? "1.00" : detection.matches?.length ? "0.70" : "0.00";
    card.innerHTML = `<div class="field-meta"><span class="field-kind">OCR 行 ${detection.lineIndex + 1}</span><span class="field-confidence">匹配置信 ${confidence}</span></div><input class="raw-text" type="text" aria-label="OCR 文本"><div class="field-actions"><select class="kind-select" aria-label="字段类型"><option value="unresolved">未解决</option><option value="stat">属性</option><option value="slot">槽位</option><option value="hero">角色</option><option value="artifact">神器</option><option value="set">套装</option><option value="rarity">品质</option></select><select class="candidate-select" aria-label="字典候选">${candidateOptions(detection, review.selectedId)}</select></div><p class="field-resolution"></p>`;
    const rawInput = card.querySelector(".raw-text");
    const kindSelect = card.querySelector(".kind-select");
    const candidateSelect = card.querySelector(".candidate-select");
    const resolution = card.querySelector(".field-resolution");
    rawInput.value = review.rawText;
    kindSelect.value = review.kind;
    resolution.textContent = review.selectedId ? `已选择 ${review.selectedId}` : "尚未选择唯一字典项";
    rawInput.addEventListener("change", () => { review.rawText = rawInput.value; });
    kindSelect.addEventListener("change", () => {
      review.kind = kindSelect.value;
      if (kindSelect.value === "unresolved") { review.selectedId = null; review.status = "unresolved"; }
      renderFields(); renderOverlays();
    });
    candidateSelect.addEventListener("change", () => {
      review.selectedId = candidateSelect.value || null;
      const match = detection.matches.find((candidate) => candidate.id === review.selectedId);
      review.kind = match?.kind || "unresolved";
      review.status = match ? "matched" : "unresolved";
      renderFields(); renderOverlays();
    });
    card.addEventListener("mouseenter", () => document.querySelector(`.ocr-box[data-line-index="${detection.lineIndex}"]`)?.classList.add("active"));
    card.addEventListener("mouseleave", () => document.querySelector(`.ocr-box[data-line-index="${detection.lineIndex}"]`)?.classList.remove("active"));
    return card;
  });
  element["field-list"].replaceChildren(...cards);
}

function render() {
  renderSummary();
  renderShotList();
  renderPreview();
  renderFields();
}

function selectImage(index) {
  state.selectedIndex = Math.max(0, Math.min(index, (state.bundle?.images?.length || 1) - 1));
  state.zoom = 1;
  render();
}

async function loadBundle(bundle, exampleImageUrl = null) {
  state.bundle = hydrateBundle(bundle);
  state.selectedIndex = 0;
  state.zoom = 1;
  if (exampleImageUrl && state.bundle.images[0]) state.bundle.images[0].exampleImageUrl = exampleImageUrl;
  render();
  setStatus(`已载入任务 ${state.bundle.jobId}`);
}

element["recognition-file"].addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    await loadBundle(JSON.parse(await file.text()));
  } catch (error) { setStatus(error.message, true); }
});

element["image-files"].addEventListener("change", (event) => {
  for (const file of event.target.files) state.imageUrls.set(file.name, URL.createObjectURL(file));
  renderPreview();
  setStatus(`已关联 ${event.target.files.length} 张本地原图`);
});

element["load-example"].addEventListener("click", async () => {
  try {
    const response = await fetch("../examples/ocr-recognition.example.json");
    if (!response.ok) throw new Error(`示例载入失败：HTTP ${response.status}`);
    await loadBundle(await response.json(), "../outputs/design/prototype-browser-verified.png");
  } catch (error) { setStatus(error.message, true); }
});

element.previous.addEventListener("click", () => selectImage(state.selectedIndex - 1));
element.next.addEventListener("click", () => selectImage(state.selectedIndex + 1));
element["zoom-out"].addEventListener("click", () => { state.zoom = Math.max(.5, state.zoom - .1); renderPreview(); });
element["zoom-in"].addEventListener("click", () => { state.zoom = Math.min(2, state.zoom + .1); renderPreview(); });
element["fit-view"].addEventListener("click", () => { state.zoom = 1; renderPreview(); });
element["show-all-lines"].addEventListener("change", (event) => { state.showAllLines = event.target.checked; renderOverlays(); });
element["capture-type"].addEventListener("change", (event) => { if (selectedImage()) selectedImage().captureType = event.target.value; renderShotList(); });

document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filter-button").forEach((entry) => entry.classList.toggle("selected", entry === button));
  renderFields();
}));

element["accept-image"].addEventListener("click", () => {
  const image = selectedImage();
  if (!image) return setStatus("请先载入识别任务", true);
  const unresolved = Object.values(image.review || {}).filter((entry) => !entry.selectedId).length;
  if (unresolved) return setStatus(`仍有 ${unresolved} 个待处理字段；可驳回或补充候选后再接受`, true);
  image.reviewStatus = "accepted";
  render();
  setStatus(`已接受 ${image.originalName}`);
});

element["reject-image"].addEventListener("click", () => {
  const image = selectedImage();
  if (!image) return setStatus("请先载入识别任务", true);
  image.reviewStatus = "rejected";
  render();
  setStatus(`已驳回 ${image.originalName}`);
});

element["export-review"].addEventListener("click", () => {
  if (!state.bundle) return setStatus("请先载入识别任务", true);
  const output = {
    schemaVersion: "0.1.0",
    jobId: state.bundle.jobId,
    reviewedAt: new Date().toISOString(),
    sourceManifest: state.bundle.sourceManifest,
    images: state.bundle.images.map(({ sequence, originalName, imageSha256, captureType, reviewStatus, review }) => ({
      sequence, originalName, imageSha256, captureType, reviewStatus,
      decisions: Object.entries(review || {}).map(([lineIndex, decision]) => ({ lineIndex: Number(lineIndex), ...decision }))
    }))
  };
  const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${state.bundle.jobId}.review.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  setStatus("校对结果已导出；它是 Review 决策，不是最终 AccountSnapshot");
});

render();
