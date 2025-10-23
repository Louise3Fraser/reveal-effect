const canvas = document.getElementById("pixelCanvas");
const ctx = canvas.getContext("2d");

const config = {
  image: document.body.dataset.image || "./assets/bg-1.jpg",
  pixelSize: parseInt(document.body.dataset.pixelsize || 20),
  revealRadius: parseInt(document.body.dataset.radius || 50),
  bgColor: document.body.dataset.bg || "#f8f9fa",
};

let mousePos = { x: -1000, y: -1000 };
let pixels = [];

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const img = new Image();
img.src = config.image;

function initPixels() {
  pixels = [];
  const cols = Math.ceil(width / config.pixelSize);
  const rows = Math.ceil(height / config.pixelSize);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      pixels.push({
        x,
        y,
        revealed: false,
        revealProgress: 0,
      });
    }
  }
}

function draw() {
  ctx.fillStyle = config.bgColor;
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(img, 0, 0, width, height);

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
      ctx.roundRect(px + offset, py + offset, size, size, 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(draw);
}

function handleMouseMove(e) {
  mousePos = { x: e.clientX, y: e.clientY };
}

function handleTouchMove(e) {
  const touch = e.touches[0];
  mousePos = { x: touch.clientX, y: touch.clientY };
}

window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  initPixels();
});

canvas.addEventListener("mousemove", handleMouseMove);
canvas.addEventListener("touchmove", handleTouchMove);

img.onload = () => {
  initPixels();
  draw();
};
