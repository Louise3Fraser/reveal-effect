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
  image: document.body.dataset.image || "./assets/petal.jpg",
  pixelSize: getDatasetNumber("pixelsize", "pixelSize", 20),
  revealRadius: getDatasetNumber("radius", null, 50),
  bgColor: document.body.dataset.bg || "#ffffff",
};

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = 1;

const ANIM_MS = 240;

const settings = {
  mode: "draw", // draw | hover | erase
  shape: "square", // square | dot
  animate: true,
  fadeMs: 0, // 0 = revealed cells stay revealed
};

let img = null;
let cols = 0;
let rows = 0;
let state = new Uint8Array(0); // 1 = revealed (target state)
let changedAt = new Float64Array(0); // when each cell last flipped
let animating = new Set();
let fadeQueue = []; // [index, revealedAt, index, revealedAt, ...] in time order
let fadeHead = 0;
let fadeTimer = 0;

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
  state = new Uint8Array(cols * rows);
  changedAt = new Float64Array(cols * rows);
  animating.clear();
  fadeQueue = [];
  fadeHead = 0;
  pendingPoints = [];
  requestRender(true);
}

function setCell(i, value, now) {
  if (state[i] === value) return;
  state[i] = value;
  changedAt[i] = now;
  animating.add(i);
  if (value && settings.fadeMs > 0) fadeQueue.push(i, now);
}

function revealAll(value) {
  const now = performance.now();
  state.fill(value);
  changedAt.fill(now);
  animating.clear();
  fadeQueue = [];
  fadeHead = 0;
  if (value) enqueueRevealed(now);
  requestRender(true);
}

function enqueueRevealed(now) {
  if (settings.fadeMs <= 0) return;
  for (let i = 0; i < state.length; i++) if (state[i]) fadeQueue.push(i, now);
}

// Cell edges in device pixels, rounded so neighbouring cells meet without seams.
function cellBox(i) {
  const s = config.pixelSize * dpr;
  const cx = i % cols;
  const cy = (i / cols) | 0;
  const x = Math.round(cx * s);
  const y = Math.round(cy * s);
  return { x, y, w: Math.round((cx + 1) * s) - x, h: Math.round((cy + 1) * s) - y };
}

// The visible part of a cell, `p` from 0 (covered) to 1 (fully open).
function addShape(path, i, p) {
  if (p <= 0) return;
  const { x, y, w, h } = cellBox(i);
  if (settings.shape === "dot") {
    const r = (Math.min(w, h) / 2) * p;
    path.moveTo(x + w / 2 + r, y + h / 2);
    path.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
  } else if (p >= 1) {
    path.rect(x, y, w, h);
  } else {
    path.rect(x + (w * (1 - p)) / 2, y + (h * (1 - p)) / 2, w * p, h * p);
  }
}

function stamp(x, y, now) {
  const size = config.pixelSize;
  const r = config.revealRadius;
  const r2 = r * r;
  const value = settings.mode === "erase" ? 0 : 1;
  const minX = Math.max(0, Math.floor((x - r) / size));
  const maxX = Math.min(cols - 1, Math.floor((x + r) / size));
  const minY = Math.max(0, Math.floor((y - r) / size));
  const maxY = Math.min(rows - 1, Math.floor((y + r) / size));
  for (let cy = minY; cy <= maxY; cy++) {
    const dy = (cy + 0.5) * size - y;
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * cols + cx;
      if (state[i] === value) continue;
      const dx = (cx + 0.5) * size - x;
      if (dx * dx + dy * dy < r2) setCell(i, value, now);
    }
  }
}

// DRAWING (only while something is changing)
function requestRender(full) {
  if (full) fullRedraw = true;
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(render);
}

function render() {
  frameQueued = false;
  const now = performance.now();
  const cover = new Path2D();
  const open = new Path2D();

  if (fullRedraw) {
    fullRedraw = false;
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < state.length; i++) {
      if (state[i] && !animating.has(i)) addShape(open, i, 1);
    }
  }

  for (const p of pendingPoints) stamp(p.x, p.y, now);
  pendingPoints = [];

  // Cover back up cells whose fade time has passed (queue is in time order).
  if (settings.fadeMs > 0) {
    while (fadeHead < fadeQueue.length && fadeQueue[fadeHead + 1] + settings.fadeMs <= now) {
      const i = fadeQueue[fadeHead];
      if (state[i] && changedAt[i] === fadeQueue[fadeHead + 1]) setCell(i, 0, now);
      fadeHead += 2;
    }
    if (fadeHead > 8192) {
      fadeQueue = fadeQueue.slice(fadeHead);
      fadeHead = 0;
    }
  }

  for (const i of animating) {
    const t = settings.animate ? Math.min(1, (now - changedAt[i]) / ANIM_MS) : 1;
    const eased = 1 - Math.pow(1 - t, 3);
    const { x, y, w, h } = cellBox(i);
    cover.rect(x, y, w, h);
    addShape(open, i, state[i] ? eased : 1 - eased);
    if (t >= 1) animating.delete(i);
  }

  ctx.fillStyle = config.bgColor;
  ctx.fill(cover);
  if (img) {
    ctx.save();
    ctx.clip(open);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  if (animating.size) requestRender(false);
  scheduleFade(now);
}

function scheduleFade(now) {
  clearTimeout(fadeTimer);
  if (settings.fadeMs <= 0 || fadeHead >= fadeQueue.length) return;
  const due = fadeQueue[fadeHead + 1] + settings.fadeMs - now;
  fadeTimer = setTimeout(() => requestRender(false), Math.max(0, due));
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
  const hovering = settings.mode === "hover" && e.pointerType === "mouse";
  if (!isPressed && !hovering) return;
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
canvas.addEventListener("pointerleave", () => {
  if (!isPressed) lastPoint = null;
});

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
const fadeRange = document.getElementById("fade");
const fadeValue = document.getElementById("fadeValue");
const animateInput = document.getElementById("animate");
const originalImagePath = config.image;
const defaults = { ...config, ...settings };
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

// Segmented controls (Mode, Shape)
function bindSegmented(id, key, onChange) {
  const group = document.getElementById(id);
  if (!group) return () => {};
  const buttons = group.querySelectorAll("button");
  const select = (value) => {
    settings[key] = value;
    buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === value)));
    onChange?.();
  };
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) select(btn.dataset.value);
  });
  return select;
}
const selectMode = bindSegmented("mode", "mode", () => {
  canvas.style.cursor = settings.mode === "erase" ? "cell" : "";
});
const selectShape = bindSegmented("shape", "shape", () => requestRender(true));

animateInput?.addEventListener("change", () => {
  settings.animate = animateInput.checked;
});

function setFade(tenths) {
  const wasOff = settings.fadeMs <= 0;
  settings.fadeMs = tenths * 100;
  if (fadeValue) fadeValue.textContent = tenths ? (tenths / 10).toFixed(1) + "s" : "Off";
  if (fadeRange) setSliderFill(fadeRange);
  if (settings.fadeMs <= 0) {
    fadeQueue = [];
    fadeHead = 0;
  } else if (wasOff) {
    enqueueRevealed(performance.now());
  }
  requestRender(false);
}
fadeRange?.addEventListener("input", () => setFade(parseInt(fadeRange.value, 10)));

document.getElementById("clearBtn")?.addEventListener("click", () => revealAll(0));
document.getElementById("fillBtn")?.addEventListener("click", () => revealAll(1));

document.getElementById("saveBtn")?.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reveal.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

// Reset everything back to how the page loaded.
resetBtn?.addEventListener("click", () => {
  releaseObjectUrl();
  Object.assign(config, { pixelSize: defaults.pixelSize, revealRadius: defaults.revealRadius, bgColor: defaults.bgColor });
  if (radiusRange) radiusRange.value = config.revealRadius;
  if (pixelSizeRange) pixelSizeRange.value = config.pixelSize;
  if (bgColorInput) bgColorInput.value = config.bgColor;
  if (fadeRange) fadeRange.value = 0;
  if (animateInput) animateInput.checked = settings.animate = defaults.animate;
  document.querySelectorAll('input[type="range"]').forEach(setSliderFill);
  selectMode(defaults.mode);
  selectShape(defaults.shape);
  setFade(0);
  selectPreset(presetButtons[0]);
  setImage(originalImagePath, presetButtons[0]?.querySelector("img")?.src);
});

// COLLAPSE (animation is pure CSS, see .panel-body)
const panelToggle = document.getElementById("panelToggle");
const panelBody = document.getElementById("panelBody");

if (panelToggle && panelBody) {
  panelBody.dataset.state = "open";
  panelToggle.addEventListener("click", () => {
    const open = panelBody.dataset.state !== "open";
    panelBody.dataset.state = open ? "open" : "closed";
    panelToggle.setAttribute("aria-expanded", String(open));
  });
}
