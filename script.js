const canvas = document.getElementById("pixelCanvas");
const ctx = canvas.getContext("2d");

let mousePos = { x: -1000, y: -1000 };
let pixels = [];

const pixelSize = 8;
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const img = new Image();
img.src = "./assets/bg-2.jpg";

function initPixels() {
  pixels = [];
  const cols = Math.ceil(width / pixelSize);
  const rows = Math.ceil(height / pixelSize);
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
  ctx.fillStyle = "#eae7dd";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(img, 0, 0, width, height);

  for (let pixel of pixels) {
    const px = pixel.x * pixelSize;
    const py = pixel.y * pixelSize;

    const dx = px - mousePos.x;
    const dy = py - mousePos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const revealRadius = 55;

    if (distance < revealRadius && !pixel.revealed) {
      pixel.revealed = true;
    }

    if (pixel.revealed && pixel.revealProgress < 1) {
      pixel.revealProgress = 1;
    }

    if (pixel.revealProgress === 0) {
      ctx.fillStyle = "#f8f9fa";
      ctx.fillRect(px, py, pixelSize, pixelSize);
    } else if (pixel.revealProgress < 1) {
      const size = pixelSize * (1 - pixel.revealProgress);
      const offset = (pixelSize - size) / 2;

      ctx.fillStyle = "#f8f9fa";
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
