// CANVAS
const canvas = document.getElementById("pixelCanvas");
const ctx = canvas.getContext("2d");

// Offscreen copy of the image, pre-scaled to the canvas, so reveals are a
// cheap 1:1 copy instead of rescaling the full-size photo.
const layer = document.createElement("canvas");
const layerCtx = layer.getContext("2d");

function getDatasetNumber(primary, fallback, def) {
  const val = document.body.dataset[primary] ?? document.body.dataset[fallback];
  const n = parseInt(val ?? def, 10);
  return Number.isFinite(n) ? n : parseInt(def, 10);
}

const config = {
  image: document.body.dataset.image || "./assets/bg-4.jpg",
  pixelSize: getDatasetNumber("pixelsize", "pixelSize", 20),
  revealRadius: getDatasetNumber("radius", null, 50),
  bgColor: document.body.dataset.bg || "#ffffff",
};

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = 1;

let img = null;
let cols = 0;
let rows = 0;
let revealed = new Uint8Array(0);

let isPressed = false;
let lastPoint = null;
let pendingPoints = [];
let fullRedraw = true;
let frameQueued = false;

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.width = layer.width = Math.round(width * dpr);
  canvas.height = layer.height = Math.round(height * dpr);
  drawLayer();
}

// Draw the image with "cover" fit so it fills the screen without stretching.
function drawLayer() {
  layerCtx.clearRect(0, 0, layer.width, layer.height);
  if (!img) return;
  const scale = Math.max(
    layer.width / img.naturalWidth,
    layer.height / img.naturalHeight
  );
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  layerCtx.imageSmoothingQuality = "high";
  layerCtx.drawImage(img, (layer.width - w) / 2, (layer.height - h) / 2, w, h);
}

// GRID
function initPixels() {
  cols = Math.ceil(width / config.pixelSize);
  rows = Math.ceil(height / config.pixelSize);
  revealed = new Uint8Array(cols * rows);
  pendingPoints = [];
  requestRender(true);
}

// Cell edges in device pixels, rounded so neighbouring cells meet without seams.
function addCell(path, cx, cy) {
  const s = config.pixelSize * dpr;
  const x0 = Math.round(cx * s);
  const y0 = Math.round(cy * s);
  path.rect(x0, y0, Math.round((cx + 1) * s) - x0, Math.round((cy + 1) * s) - y0);
}

function revealCircle(x, y, path) {
  const size = config.pixelSize;
  const r = config.revealRadius;
  const r2 = r * r;
  const minX = Math.max(0, Math.floor((x - r) / size));
  const maxX = Math.min(cols - 1, Math.floor((x + r) / size));
  const minY = Math.max(0, Math.floor((y - r) / size));
  const maxY = Math.min(rows - 1, Math.floor((y + r) / size));
  let added = false;
  for (let cy = minY; cy <= maxY; cy++) {
    const dy = (cy + 0.5) * size - y;
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * cols + cx;
      if (revealed[i]) continue;
      const dx = (cx + 0.5) * size - x;
      if (dx * dx + dy * dy < r2) {
        revealed[i] = 1;
        addCell(path, cx, cy);
        added = true;
      }
    }
  }
  return added;
}

// DRAWING (only when something changed)
function requestRender(full) {
  if (full) fullRedraw = true;
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(render);
}

function render() {
  frameQueued = false;
  const path = new Path2D();
  let dirty = false;

  if (fullRedraw) {
    fullRedraw = false;
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < revealed.length; i++) {
      if (revealed[i]) {
        addCell(path, i % cols, (i / cols) | 0);
        dirty = true;
      }
    }
  }

  for (const p of pendingPoints) {
    if (revealCircle(p.x, p.y, path)) dirty = true;
  }
  pendingPoints = [];

  if (dirty && img) {
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

// HANDLING
// Queue stamps along the segment from the last point so fast strokes stay solid.
function stroke(x, y) {
  const step = Math.max(1, Math.min(config.revealRadius, config.pixelSize) / 2);
  if (lastPoint) {
    const dx = x - lastPoint.x;
    const dy = y - lastPoint.y;
    const n = Math.floor(Math.hypot(dx, dy) / step);
    for (let k = 1; k <= n; k++) {
      pendingPoints.push({
        x: lastPoint.x + (dx * k) / (n + 1),
        y: lastPoint.y + (dy * k) / (n + 1),
      });
    }
  }
  pendingPoints.push({ x, y });
  lastPoint = { x, y };
  requestRender(false);
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  isPressed = true;
  lastPoint = null;
  canvas.setPointerCapture?.(e.pointerId);
  stroke(e.clientX, e.clientY);
  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!isPressed) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  if (events.length) events.forEach((ev) => stroke(ev.clientX, ev.clientY));
  else stroke(e.clientX, e.clientY);
});

function endStroke() {
  isPressed = false;
  lastPoint = null;
}
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("lostpointercapture", endStroke);

// RESIZING (coalesced to once per frame)
let resizeQueued = false;
window.addEventListener("resize", () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    if (window.innerWidth === width && window.innerHeight === height &&
        (window.devicePixelRatio || 1) === dpr) return;
    resizeCanvas();
    initPixels();
  });
});

// IMAGE LOADING
// Decode off the main thread and ignore stale loads when switching quickly.
let loadToken = 0;
function loadImage(src, onDone) {
  const token = ++loadToken;
  const next = new Image();
  next.src = src;
  const ready = next.decode ? next.decode() : new Promise((res, rej) => {
    next.onload = res;
    next.onerror = rej;
  });
  ready
    .then(() => {
      if (token !== loadToken) return;
      img = next;
      drawLayer();
      initPixels();
    })
    .catch(() => {})
    .finally(() => onDone?.());
}

// BEGIN
resizeCanvas();
initPixels();
loadImage(config.image);

// CONTROLS
const radiusRange = document.getElementById("radius");
const pixelSizeRange = document.getElementById("pixelSize");
const bgColorInput = document.getElementById("bgColor");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const resetBtn = document.getElementById("resetImage");
const presetButtons = document.querySelectorAll(".preset");
const originalImagePath = config.image;
let objectUrl = null;

function setSliderFill(el) {
  const min = +el.min || 0;
  const max = +el.max || 100;
  const val = +el.value || min;
  el.style.setProperty("--sx", ((val - min) / (max - min)) * 100 + "%");
}

if (radiusRange) {
  radiusRange.value = config.revealRadius;
  setSliderFill(radiusRange);
  radiusRange.addEventListener("input", () => {
    config.revealRadius = parseInt(radiusRange.value, 10);
    setSliderFill(radiusRange);
  });
}

if (pixelSizeRange) {
  pixelSizeRange.value = config.pixelSize;
  setSliderFill(pixelSizeRange);
  pixelSizeRange.addEventListener("input", () => {
    const v = parseInt(pixelSizeRange.value, 10);
    setSliderFill(pixelSizeRange);
    if (v === config.pixelSize) return;
    config.pixelSize = v;
    initPixels();
  });
}

if (bgColorInput) {
  if (/^#[0-9a-f]{6}$/i.test(config.bgColor)) bgColorInput.value = config.bgColor;
  bgColorInput.addEventListener("input", () => {
    config.bgColor = bgColorInput.value;
    requestRender(true);
  });
}

function selectPreset(btn) {
  presetButtons.forEach((p) => p.classList.toggle("selected", p === btn));
}

function setImage(src, previewSrc) {
  loadImage(src);
  if (imagePreview) imagePreview.src = previewSrc || src;
}

function releaseObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

document.getElementById("presets")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".preset");
  if (!btn?.dataset.src) return;
  selectPreset(btn);
  releaseObjectUrl();
  setImage(btn.dataset.src, btn.querySelector("img")?.src);
});

imageInput?.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  releaseObjectUrl();
  objectUrl = URL.createObjectURL(file);
  setImage(objectUrl);
  selectPreset(null);
  imageInput.value = "";
});

resetBtn?.addEventListener("click", () => {
  releaseObjectUrl();
  selectPreset(presetButtons[0]);
  setImage(originalImagePath, presetButtons[0]?.querySelector("img")?.src);
});

// COLLAPSE
const panelToggle = document.getElementById("panelToggle");
const panelBody = document.getElementById("panelBody");

if (panelToggle && panelBody) {
  let open = true;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  panelBody.dataset.state = "open";

  panelToggle.addEventListener("click", () => {
    open = !open;
    panelToggle.setAttribute("aria-expanded", String(open));

    // Animate from the current height, so clicks mid-animation reverse smoothly.
    const from = panelBody.getBoundingClientRect().height;
    panelBody.style.display = "";
    panelBody.style.height = "auto";
    const to = open ? panelBody.scrollHeight : 0;
    panelBody.style.height = from + "px";
    void panelBody.offsetHeight;
    panelBody.dataset.state = open ? "open" : "closed";
    panelBody.style.height = to + "px";
    if (reduceMotion.matches) finishToggle();
  });

  function finishToggle() {
    if (open) panelBody.style.height = "auto";
    else panelBody.style.display = "none";
  }

  panelBody.addEventListener("transitionend", (e) => {
    if (e.target !== panelBody || e.propertyName !== "height") return;
    finishToggle();
  });
}
