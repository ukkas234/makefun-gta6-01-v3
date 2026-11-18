// Solmara — canvas-generated textures. No external assets, no network.
// Every factory returns a THREE.CanvasTexture; three.js is vendored under
// game/vendor/three.module.js.
import * as THREE from '../vendor/three.module.js';

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Speckle noise over the whole canvas: cheap asphalt/grain detail.
function speckle(ctx, w, h, count, colors, sizeMax = 2) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = 0.08 + Math.random() * 0.22;
    const s = 1 + Math.random() * sizeMax;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

export function asphaltTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#23242a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 2600, ['#2e2f36', '#1a1b20', '#3a3b42', '#101116']);
  // Faint cracks.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j += 1) {
      x += (Math.random() - 0.5) * 70;
      y += (Math.random() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, 8, 8);
}

export function sidewalkTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#8a8d94';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 900, ['#7a7d84', '#9a9da4', '#6e7178']);
  // Pavement tile grid.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
  }
  return toTexture(c, 4, 4);
}

// variant 0..7 picks the base palette; lit=true lights some windows warm
// (night city), lit=false leaves them dark glass.
export function facadeTexture(variant = 0, lit = true) {
  const palettes = [
    '#5a4a6b', '#6b4a3f', '#3f5a6b', '#4a6b4f',
    '#6b5a3f', '#54423a', '#3a4a5e', '#5e3a4a',
  ];
  const base = palettes[((variant % palettes.length) + palettes.length) % palettes.length];
  const [c, ctx] = makeCanvas(256, 512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);
  speckle(ctx, 256, 512, 500, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.12)']);
  // Window grid: 6 columns x 14 rows.
  const cols = 6;
  const rows = 14;
  const ww = 256 / cols;
  const wh = 512 / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * ww + ww * 0.2;
      const y = r * wh + wh * 0.22;
      const w = ww * 0.6;
      const h = wh * 0.56;
      const isLit = lit && Math.random() < 0.45;
      if (isLit) {
        const warm = Math.random() < 0.75;
        ctx.fillStyle = warm ? '#ffd27a' : '#9fe8ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = '#141824';
        ctx.shadowBlur = 0;
      }
      ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
      // Window frame.
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }
  // Ground-floor shopfront band.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 512 - wh * 0.9, 256, wh * 0.9);
  return toTexture(c);
}

export function grassTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2e5d33';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 3200, ['#26502c', '#3a7040', '#1f4526', '#4a8a4a'], 3);
  return toTexture(c, 10, 10);
}

export function sandTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 2400, ['#c9ae76', '#e8d3a0', '#b89a5e', '#f0dcb0'], 2);
  // Wind ripples.
  ctx.strokeStyle = 'rgba(120,95,50,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i += 1) {
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + 8, 170, y - 8, 256, y + 4);
    ctx.stroke();
  }
  return toTexture(c, 6, 6);
}

export function waterTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0e5d7d');
  grad.addColorStop(1, '#0a3d55');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  // Wave streaks.
  ctx.strokeStyle = 'rgba(160,220,255,0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i += 1) {
    const y = Math.random() * 256;
    const x = Math.random() * 200;
    const len = 20 + Math.random() * 50;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  speckle(ctx, 256, 256, 300, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.15)']);
  return toTexture(c, 10, 10);
}

// Glowing sign text on a transparent background (for neon shop signs).
export function neonTexture(text, color = '#ff2e88') {
  const [c, ctx] = makeCanvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
