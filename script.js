// CANVAS
const canvas = document.getElementById("pixelCanvas");
const ctx = canvas.getContext("2d");

function getDatasetNumber(primary, fallback, def) {
  const val = document.body.dataset[primary] ?? document.body.dataset[fallback];
  const n = parseInt(val ?? def, 10);
  return Number.isFinite(n) ? n : parseInt(def, 10);
}

const config = {
  image: document.body.dataset.image || "./assets/bg-4.jpg",
  pixelSize: getDatasetNumber("pixelsize", "pixelSize", 20),
  revealRadius: getDatasetNumber("radius", null, 50),
  bgColor: document.body.dataset.bg || "#ffffffff",
};

let mousePos = { x: -1000, y: -1000 };
let pixels = [];
let isPressed = false;

let width = window.innerWidth;
let height = window.innerHeight;

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();

const img = new Image();
img.src = config.image;

// GRID
function initPixels() {
  pixels = [];
  const cols = Math.ceil(width / config.pixelSize);
  const rows = Math.ceil(height / config.pixelSize);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      pixels.push({ x, y, revealed: false, revealProgress: 0 });
    }
  }
}

// DRAWING
function draw() {
  ctx.fillStyle = config.bgColor;
  ctx.fillRect(0, 0, width, height);

  if (img.complete) {
    ctx.drawImage(img, 0, 0, width, height);
  }

  for (let pixel of pixels) {
    const px = pixel.x * config.pixelSize;
    const py = pixel.y * config.pixelSize;

    const dx = px - mousePos.x;
    const dy = py - mousePos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const revealRadius = config.revealRadius;

    if (distance < revealRadius && !pixel.revealed) {
      pixel.revealed = true;
    }

    if (pixel.revealed && pixel.revealProgress < 1) {
      pixel.revealProgress = 1;
    }

    if (pixel.revealProgress === 0) {
      ctx.fillStyle = config.bgColor;
      ctx.fillRect(px, py, config.pixelSize, config.pixelSize);
    } else if (pixel.revealProgress < 1) {
      const size = config.pixelSize * (1 - pixel.revealProgress);
      const offset = (config.pixelSize - size) / 2;
      ctx.fillStyle = config.bgColor;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(px + offset, py + offset, size, size, 2);
      } else {
        ctx.rect(px + offset, py + offset, size, size);
      }
      ctx.fill();
    }
  }

  requestAnimationFrame(draw);
}

// HANDLING
function handleMouseMove(e) {
  if (!isPressed) return;
  mousePos = { x: e.clientX, y: e.clientY };
}
function handleMouseDown(e) {
  isPressed = true;
  mousePos = { x: e.clientX, y: e.clientY };
}
function handleMouseUp() {
  isPressed = false;
  mousePos = { x: -1000, y: -1000 };
}

function handleTouchMove(e) {
  if (!isPressed) return;
  const touch = e.touches[0];
  if (!touch) return;
  mousePos = { x: touch.clientX, y: touch.clientY };
  e.preventDefault();
}
function handleTouchStart(e) {
  isPressed = true;
  const touch = e.touches[0];
  if (!touch) return;
  mousePos = { x: touch.clientX, y: touch.clientY };
  e.preventDefault();
}
function handleTouchEnd() {
  isPressed = false;
  mousePos = { x: -1000, y: -1000 };
}

// RESIZING
window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  resizeCanvas();
  initPixels();
});

canvas.addEventListener("mousemove", handleMouseMove);
canvas.addEventListener("mousedown", handleMouseDown);
canvas.addEventListener("mouseup", handleMouseUp);
canvas.addEventListener("mouseleave", handleMouseUp);

canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
canvas.addEventListener("touchend", handleTouchEnd);
canvas.addEventListener("touchcancel", handleTouchEnd);

// BEGIN
img.onload = () => {
  initPixels();
  draw();
};

// CONTROLS
const radiusRange = document.getElementById("radius");
const radiusNumber = document.getElementById("radiusNumber");
const pixelSizeRange = document.getElementById("pixelSize");
const pixelSizeNumber = document.getElementById("pixelSizeNumber");
const bgColorInput = document.getElementById("bgColor");
const bgHexInput = document.getElementById("bgHex");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const resetBtn = document.getElementById("resetImage");
const originalImagePath = config.image;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function syncControlsFromConfig() {
  if (radiusRange) radiusRange.value = config.revealRadius;
  if (radiusNumber) radiusNumber.value = config.revealRadius;

  if (pixelSizeRange) pixelSizeRange.value = config.pixelSize;
  if (pixelSizeNumber) pixelSizeNumber.value = config.pixelSize;

  if (bgHexInput) bgHexInput.value = config.bgColor;
  if (bgColorInput) {
    try {
      bgColorInput.value = config.bgColor.startsWith("#")
        ? config.bgColor
        : "#f8f9fa";
    } catch {
      bgColorInput.value = "#f8f9fa";
    }
  }
}
syncControlsFromConfig();

function setRadius(value) {
  const v = clamp(parseInt(value || "0", 10), 1, 999);
  config.revealRadius = v;
  if (radiusRange) radiusRange.value = v;
  if (radiusNumber) radiusNumber.value = v;
}
radiusRange?.addEventListener("input", (e) => setRadius(e.target.value));
radiusNumber?.addEventListener("input", (e) => setRadius(e.target.value));

function setPixelSize(value) {
  const v = clamp(parseInt(value || "0", 10), 2, 200);
  if (v === config.pixelSize) return;
  config.pixelSize = v;
  pixelSizeRange && (pixelSizeRange.value = v);
  pixelSizeNumber && (pixelSizeNumber.value = v);
  initPixels();
}
pixelSizeRange?.addEventListener("input", (e) => setPixelSize(e.target.value));
pixelSizeNumber?.addEventListener("input", (e) => setPixelSize(e.target.value));

function setBg(color) {
  config.bgColor = color;
  if (
    bgColorInput &&
    bgColorInput.value.toLowerCase() !== color.toLowerCase()
  ) {
    try {
      bgColorInput.value = color;
    } catch {}
  }
  if (bgHexInput && bgHexInput.value.toLowerCase() !== color.toLowerCase()) {
    bgHexInput.value = color;
  }
}
bgColorInput?.addEventListener("input", (e) => setBg(e.target.value));
bgHexInput?.addEventListener("input", (e) => setBg(e.target.value.trim()));

const presetWrap = document.getElementById("presets");
if (presetWrap) {
  presetWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".preset");
    if (!btn) return;

    const src = btn.dataset.src;
    if (!src) return;

    document
      .querySelectorAll(".preset")
      .forEach((p) => p.classList.remove("selected"));
    btn.classList.add("selected");

    img.onload = () => initPixels();
    img.src = src;

    if (imagePreview) imagePreview.src = src;
  });
}

imageInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    initPixels();
  };
  img.src = url;
  if (imagePreview) imagePreview.src = url;
  document
    .querySelectorAll(".preset")
    .forEach((p) => p.classList.remove("selected"));
});

resetBtn?.addEventListener("click", () => {
  img.onload = () => initPixels();
  img.src = originalImagePath;
  if (imagePreview) imagePreview.src = originalImagePath;
  document.querySelectorAll(".preset").forEach((p, i) => {
    p.classList.toggle("selected", i === 0);
  });
});

function setSliderFill(el) {
  const min = +el.min || 0,
    max = +el.max || 100,
    val = +el.value || min;
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty("--sx", pct + "%");
}
["radius", "pixelSize"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === "radius") el.value = config.revealRadius;
  if (id === "pixelSize") el.value = config.pixelSize;
  setSliderFill(el);
  el.addEventListener("input", (e) => {
    const v = parseInt(e.target.value, 10);
    if (id === "radius") config.revealRadius = v;
    else {
      config.pixelSize = v;
      initPixels();
    }
    setSliderFill(el);
  });
});
document.querySelectorAll('input[type="range"]').forEach((r) => {
  setSliderFill(r);
  r.addEventListener("input", () => setSliderFill(r));
  r.addEventListener("change", () => setSliderFill(r));
});

// COLLAPSE
const panelToggle = document.getElementById("panelToggle");
const panelBody = document.getElementById("panelBody");

if (panelToggle && panelBody) {
  const originalDisplay = getComputedStyle(panelBody).display || "flex";

  panelToggle.setAttribute("aria-expanded", "true");
  panelBody.style.display = originalDisplay;
  panelBody.style.height = "auto";
  panelBody.dataset.state = "open";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (reduceMotion) panelBody.style.transition = "none";

  function collapse(el) {
    if (el.dataset.animating === "1" || el.dataset.state === "closed") return;
    el.dataset.animating = "1";
    const start = el.scrollHeight;
    el.style.height = start + "px";
    requestAnimationFrame(() => {
      el.dataset.state = "closed";
      el.style.height = "0px";
    });
    el.addEventListener("transitionend", function onEnd(e) {
      if (e.propertyName !== "height") return;
      el.style.display = "none";
      el.dataset.animating = "0";
      el.removeEventListener("transitionend", onEnd);
    });
  }

  function expand(el) {
    if (el.dataset.animating === "1" || el.dataset.state === "open") return;
    el.dataset.animating = "1";

    el.style.display = originalDisplay;
    el.style.height = "auto";
    const target = el.scrollHeight;

    el.style.height = "0px";
    void el.offsetHeight;
    el.dataset.state = "open";
    el.style.height = target + "px";

    el.addEventListener("transitionend", function onEnd(e) {
      if (e.propertyName !== "height") return;
      el.style.height = "auto";
      el.dataset.animating = "0";
      el.removeEventListener("transitionend", onEnd);
    });
  }

  panelToggle.addEventListener("click", () => {
    const expanded = panelToggle.getAttribute("aria-expanded") === "true";
    panelToggle.setAttribute("aria-expanded", String(!expanded));
    expanded ? collapse(panelBody) : expand(panelBody);
  });
}
