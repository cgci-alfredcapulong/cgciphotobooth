const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- DOM ---------- */
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const captureBtn = document.getElementById('captureBtn');
const downloadBtn = document.getElementById('downloadBtn');
const retakeBtn = document.getElementById('retakeBtn');
const flipBtn = document.getElementById('flipBtn');
const results = document.getElementById('results');
const actions = document.getElementById('actions');
const countdown = document.getElementById('countdown');
const flash = document.getElementById('flash');
const modeSwitcher = document.getElementById('modeSwitcher');
const deptPanel = document.getElementById('deptPanel');
const deptInput = document.getElementById('deptInput');
const deptList = document.getElementById('deptList');
const headerTitle = document.getElementById('headerTitle');
const headerSubtitle = document.getElementById('headerSubtitle');

/* ---------- STATE ---------- */
let mode = 'fun';
let stream = null;
let photos = [];
let facingMode = 'user';

const THEME = {
  green: '#1a4d2e',
  greenMid: '#2d6a4f',
  greenLight: '#d4e8db',
  greenPale: '#e8f3ec',
  white: '#ffffff'
};

if (typeof DEPARTMENTS !== 'undefined') {
  DEPARTMENTS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    deptList.appendChild(opt);
  });
}

/* ---------- MODE SWITCHING ---------- */
modeSwitcher.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  const newMode = btn.dataset.mode;
  if (newMode === mode) return;

  mode = newMode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));

  photos = [];
  results.innerHTML = '';
  results.classList.toggle('single', mode === 'department');
  actions.style.display = 'none';
  captureBtn.disabled = !stream;

  deptPanel.style.display = mode === 'department' ? 'block' : 'none';

  if (mode === 'department') {
    headerTitle.textContent = 'Department Photo';
    headerSubtitle.textContent = 'One for the whole team';
  } else {
    headerTitle.textContent = 'Teachers Day Photobooth';
    headerSubtitle.textContent = 'Est. 1995 / Smile, you look great today';
  }
});

/* ---------- CAMERA ---------- */
startBtn.addEventListener('click', startCamera);

flipBtn.addEventListener('click', async () => {
  if (!stream) return;
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  await startCamera();
});

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1080 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    video.srcObject = stream;
    video.classList.toggle('mirrored', facingMode === 'user');
    captureBtn.disabled = false;
    startBtn.disabled = true;
  } catch (err) {
    alert('Camera access denied: ' + err.message);
  }
}

/* ---------- CAPTURE ---------- */
captureBtn.addEventListener('click', async () => {
  if (mode === 'fun' && photos.length >= 3) return;
  if (mode === 'department' && photos.length >= 1) return;

  captureBtn.disabled = true;

  for (let i = 3; i > 0; i--) {
    countdown.textContent = i;
    countdown.classList.add('active');
    await sleep(800);
  }
  countdown.classList.remove('active');

  flash.classList.add('active');
  const dataUrl = captureFrame();
  flash.classList.remove('active');
  await sleep(150);

  photos.push(dataUrl);
  renderResults();

  uploadPhoto(dataUrl).catch(e => console.error('Upload failed:', e));

  const maxPhotos = mode === 'department' ? 1 : 3;
  if (photos.length < maxPhotos) {
    captureBtn.disabled = false;
  } else {
    actions.style.display = 'flex';
  }
});

retakeBtn.addEventListener('click', () => {
  photos = [];
  results.innerHTML = '';
  actions.style.display = 'none';
  captureBtn.disabled = false;
});

function captureFrame() {
  const canvas = document.createElement('canvas');
  const size = Math.min(video.videoWidth, video.videoHeight);
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');

  const sx = (video.videoWidth - size) / 2;
  const sy = (video.videoHeight - size) / 2;

  if (facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, sx, sy, size, size, 0, 0, 1200, 1200);
  return canvas.toDataURL('image/jpeg', 0.95);
}

function renderResults() {
  results.innerHTML = photos.map(src => `<img src="${src}" />`).join('');
}

/* ---------- UPLOAD ---------- */
async function uploadPhoto(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const filename = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const { error: uploadError } = await db.storage
    .from('photobooth')
    .upload(filename, blob, { contentType: 'image/jpeg' });

  if (uploadError) throw uploadError;

  const { data: urlData } = db.storage.from('photobooth').getPublicUrl(filename);

  await db.from('photos').insert({
    image_url: urlData.publicUrl,
    mode: mode,
    department: mode === 'department' ? (deptInput.value.trim() || null) : null
  });
}

/* ---------- DOWNLOAD ---------- */
downloadBtn.addEventListener('click', async () => {
  if (photos.length === 0) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Generating...';

  try {
    let dataUrl;
    if (mode === 'department') {
      dataUrl = await generateDepartmentImage(photos[0], deptInput.value.trim());
    } else {
      dataUrl = await generateFunStrip(photos);
    }
    triggerDownload(dataUrl, mode);
  } catch (err) {
    console.error(err);
    alert('Failed to generate image: ' + err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

function triggerDownload(dataUrl, mode) {
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = dataUrl;
  a.download = `teachers-day-${mode}-${ts}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ================================================================
   IMAGE GENERATION - 90's THEME
   ================================================================ */

const TAGLINE = 'Teacher, Ikaw naman.';

/**
 * FUN SHOTS - vertical 3-photo strip
 */
async function generateFunStrip(imgs) {
  const W = 1200;
  const HEADER_H = 360;
  const FOOTER_H = 260;
  const PAD = 60;
  const GAP = 48;
  const PHOTO_SIZE = W - PAD * 2;
  const H = HEADER_H + PAD / 2 + (PHOTO_SIZE * 3) + (GAP * 2) + FOOTER_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // White base
  ctx.fillStyle = THEME.white;
  ctx.fillRect(0, 0, W, H);

  // Pale green inner field (retro paper feel)
  ctx.fillStyle = THEME.greenPale;
  ctx.fillRect(20, 20, W - 40, H - 40);

  // Chunky outer border
  drawChunkyBorder(ctx, 0, 0, W, H, 22, THEME.green, 5);

  // Memphis decorations in the white margin
  drawMemphisBackdrop(ctx, 0, 0, W, H);

  // Corner triangles (chunky, two-tone)
  drawCornerAccents(ctx, 0, 0, W, H, 110, THEME.green, THEME.greenMid);

  /* ---------- HEADER ---------- */
  const hx = 50, hy = 50, hw = W - 100, hh = HEADER_H - 70;

  // Header hard shadow
  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 16, hy + 16, hw, hh);

  // Header block
  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, hy, hw, hh);

  // Diagonal stripe band behind title
  ctx.save();
  ctx.beginPath();
  ctx.rect(hx, hy, hw, hh);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 6;
  for (let i = -hh; i < hw + hh; i += 26) {
    ctx.beginPath();
    ctx.moveTo(hx + i, hy);
    ctx.lineTo(hx + i + hh, hy + hh);
    ctx.stroke();
  }
  ctx.restore();

  // Memphis dots inside header
  drawMemphisDots(ctx, hx, hy, hw, hh);

  // Header text
  drawRetroHeader(ctx, hx, hy, hw, hh, {
    eyebrow: "TEACHERS DAY",
    title: 'HAPPY TEACHERS DAY',
    subtitle: 'SMILE, YOU LOOK GREAT TODAY'
  });

  // Zig-zag under header (chunky)
  drawZigZag(ctx, hx, hy + hh, hw, 22, THEME.green, 26);

  /* ---------- PHOTOS ---------- */
  const startY = HEADER_H + 10;

  for (let i = 0; i < 3; i++) {
    const y = startY + i * (PHOTO_SIZE + GAP);
    const img = await loadImage(imgs[i]);

    // Sticker shadow
    ctx.fillStyle = THEME.greenLight;
    ctx.fillRect(PAD + 16, y + 16, PHOTO_SIZE, PHOTO_SIZE);

    // Frame outer
    ctx.fillStyle = THEME.green;
    ctx.fillRect(PAD - 10, y - 10, PHOTO_SIZE + 20, PHOTO_SIZE + 20);

    // Frame inner (white gutter)
    ctx.fillStyle = THEME.white;
    ctx.fillRect(PAD - 4, y - 4, PHOTO_SIZE + 8, PHOTO_SIZE + 8);

    // Photo
    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // Thin inner green line
    ctx.strokeStyle = THEME.green;
    ctx.lineWidth = 3;
    ctx.strokeRect(PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // Number tag
    drawNumberTag(ctx, PAD + 10, y + 10, String(i + 1).padStart(2, '0'));
  }

  /* ---------- FOOTER ---------- */
  const fy = H - FOOTER_H - 10;

  // Zig-zag above footer
  drawZigZag(ctx, 50, fy - 22, W - 100, 22, THEME.green, 26);

  // Footer block shadow
  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(66, fy + 16, W - 132, FOOTER_H - 60);

  // Footer block
  ctx.fillStyle = THEME.green;
  ctx.fillRect(50, fy, W - 100, FOOTER_H - 60);

  drawRetroFooter(ctx, 50, fy, W - 100, FOOTER_H - 60);

  return canvas.toDataURL('image/png');
}

/**
 * DEPARTMENT - single landscape photo
 */
async function generateDepartmentImage(imgSrc, departmentName) {
  const W = 1800;
  const H = 1350;
  const PAD = 70;
  const HEADER_H = 300;
  const FOOTER_H = 260;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // White base
  ctx.fillStyle = THEME.white;
  ctx.fillRect(0, 0, W, H);

  // Pale inner field
  ctx.fillStyle = THEME.greenPale;
  ctx.fillRect(24, 24, W - 48, H - 48);

  // Chunky outer border
  drawChunkyBorder(ctx, 0, 0, W, H, 26, THEME.green, 6);

  // Memphis decorations
  drawMemphisBackdrop(ctx, 0, 0, W, H);

  // Corner triangles
  drawCornerAccents(ctx, 0, 0, W, H, 150, THEME.green, THEME.greenMid);

  /* ---------- HEADER ---------- */
  const hx = 60, hy = 60, hw = W - 120, hh = HEADER_H - 80;

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 18, hy + 18, hw, hh);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, hy, hw, hh);

  ctx.save();
  ctx.beginPath();
  ctx.rect(hx, hy, hw, hh);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 8;
  for (let i = -hh; i < hw + hh; i += 32) {
    ctx.beginPath();
    ctx.moveTo(hx + i, hy);
    ctx.lineTo(hx + i + hh, hy + hh);
    ctx.stroke();
  }
  ctx.restore();

  drawMemphisDots(ctx, hx, hy, hw, hh);

  const dept = (departmentName && departmentName.trim()) || 'Department';
  drawRetroHeader(ctx, hx, hy, hw, hh, {
    eyebrow: "TEACHERS DAY '95",
    title: dept.toUpperCase(),
    subtitle: 'ONE TEAM. ONE FAMILY.'
  });

  drawZigZag(ctx, hx, hy + hh, hw, 24, THEME.green, 34);

  /* ---------- PHOTO ---------- */
  const photoY = hy + hh + 70;
  const photoH = H - photoY - FOOTER_H - 60;
  const photoX = PAD;
  const photoW = W - PAD * 2;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(photoX + 20, photoY + 20, photoW, photoH);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(photoX - 14, photoY - 14, photoW + 28, photoH + 28);

  ctx.fillStyle = THEME.white;
  ctx.fillRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);

  const img = await loadImage(imgSrc);
  drawImageCover(ctx, img, photoX, photoY, photoW, photoH);

  ctx.strokeStyle = THEME.green;
  ctx.lineWidth = 4;
  ctx.strokeRect(photoX, photoY, photoW, photoH);

  // Corner "photo" sticker tag
  drawStickerTag(ctx, photoX + 24, photoY + 24, `PHOTO 01`, -4);

  /* ---------- FOOTER ---------- */
  const fy = H - FOOTER_H;

  drawZigZag(ctx, 60, fy - 24, W - 120, 24, THEME.green, 34);

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(78, fy + 18, W - 156, FOOTER_H - 80);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(60, fy, W - 120, FOOTER_H - 80);

  drawRetroFooter(ctx, 60, fy, W - 120, FOOTER_H - 80);

  return canvas.toDataURL('image/png');
}

/* ================================================================
   RETRO DRAWING HELPERS
   ================================================================ */

function drawChunkyBorder(ctx, x, y, w, h, thickness, color, innerThickness) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);
  ctx.fillRect(x, y + h - thickness, w, thickness);
  ctx.fillRect(x, y, thickness, h);
  ctx.fillRect(x + w - thickness, y, thickness, h);

  if (innerThickness) {
    const inset = thickness + 10;
    ctx.strokeStyle = THEME.greenMid;
    ctx.lineWidth = innerThickness;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }
}

function drawCornerAccents(ctx, x, y, w, h, size, color, accentColor) {
  ctx.fillStyle = color;
  // top-left big triangle
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();
  // inner highlight
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 24);
  ctx.lineTo(x + size * 0.55, y + 24);
  ctx.lineTo(x + 24, y + size * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  // top-right
  ctx.beginPath();
  ctx.moveTo(x + w - size, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + w - 24, y + 24);
  ctx.lineTo(x + w - size * 0.55, y + 24);
  ctx.lineTo(x + w - 24, y + size * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(x, y + h - size);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + size, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + h - 24);
  ctx.lineTo(x + 24, y + h - size * 0.55);
  ctx.lineTo(x + size * 0.55, y + h - 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(x + w - size, y + h - size);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - size, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + w - 24, y + h - 24);
  ctx.lineTo(x + w - 24, y + h - size * 0.55);
  ctx.lineTo(x + w - size * 0.55, y + h - 24);
  ctx.closePath();
  ctx.fill();
}

function drawZigZag(ctx, x, y, w, h, color, teeth) {
  ctx.fillStyle = color;
  const toothW = w / teeth;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  for (let i = 0; i < teeth; i++) {
    const px = x + i * toothW;
    ctx.lineTo(px + toothW / 2, y);
    ctx.lineTo(px + toothW, y + h);
  }
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawMemphisBackdrop(ctx, x, y, w, h) {
  // Scattered memphis shapes in the pale field, avoiding the header/photo area.
  ctx.save();
  ctx.globalAlpha = 0.35;

  // outline circles
  ctx.strokeStyle = THEME.greenMid;
  ctx.lineWidth = 3;

  const circles = [
    [90, h - 140, 34],
    [w - 100, 120, 28],
    [w - 140, h - 200, 22]
  ];
  circles.forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // small filled squares (rotated)
  ctx.fillStyle = THEME.greenMid;
  const squares = [
    [70, 160, 14, 20],
    [w - 80, h - 130, 16, -12]
  ];
  squares.forEach(([sx, sy, s, rot]) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  });

  // tiny dots
  const dots = [
    [120, h - 260],
    [w - 120, 220],
    [w - 60, h - 300]
  ];
  dots.forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawMemphisDots(ctx, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = THEME.white;

  // scattered dots inside header
  const pts = [
    [x + w * 0.08, y + h * 0.30],
    [x + w * 0.14, y + h * 0.72],
    [x + w * 0.22, y + h * 0.18],
    [x + w * 0.80, y + h * 0.28],
    [x + w * 0.88, y + h * 0.68],
    [x + w * 0.92, y + h * 0.35],
    [x + w * 0.74, y + h * 0.80]
  ];
  pts.forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // small triangle
  ctx.beginPath();
  ctx.moveTo(x + w * 0.10, y + h * 0.50);
  ctx.lineTo(x + w * 0.14, y + h * 0.44);
  ctx.lineTo(x + w * 0.14, y + h * 0.56);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + w * 0.90, y + h * 0.55);
  ctx.lineTo(x + w * 0.86, y + h * 0.48);
  ctx.lineTo(x + w * 0.86, y + h * 0.62);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawRetroHeader(ctx, x, y, w, h, { eyebrow, title, subtitle }) {
  const cx = x + w / 2;

  // Eyebrow — small tag
  ctx.font = `bold 22px "Trebuchet MS", sans-serif`;
  const eW = ctx.measureText(eyebrow).width;
  const tagW = eW + 44;
  const tagH = 44;
  const tagX = cx - tagW / 2;
  const tagY = y + 22;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(tagX, tagY, tagW, tagH);
  ctx.fillStyle = THEME.green;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 22px "Trebuchet MS", sans-serif`;
  ctx.fillText(eyebrow, cx, tagY + tagH / 2 + 1);

  // Title — auto-split into 2 lines if long
  const lines = fitTitleLines(ctx, title, w - 120, 68);
  const lineHeight = 78;
  const totalH = lines.length * lineHeight;
  const startY = y + h / 2 - totalH / 2 + 24;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight + lineHeight / 2;

    // Stroke
    ctx.font = `900 68px "Trebuchet MS", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = THEME.greenMid;
    ctx.strokeText(line, cx, ly);

    // Hard shadow
    ctx.fillStyle = THEME.greenMid;
    ctx.fillText(line, cx + 5, ly + 5);

    // Fill
    ctx.fillStyle = THEME.white;
    ctx.fillText(line, cx, ly);
  });

  // Subtitle
  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 24px "Trebuchet MS", sans-serif`;
  ctx.fillText(subtitle, cx, y + h - 40);
}

function fitTitleLines(ctx, text, maxWidth, fontSize) {
  ctx.font = `900 ${fontSize}px "Trebuchet MS", sans-serif`;
  if (ctx.measureText(text).width <= maxWidth) return [text];

  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  return lines.slice(0, 3);
}

function drawRetroFooter(ctx, x, y, w, h) {
  const cx = x + w / 2;

  // Badge — bold outlined rectangle (rotated slightly)
  ctx.save();
  ctx.translate(cx, y + 52);
  ctx.rotate(-1.5 * Math.PI / 180);

  const badgeText = `TEACHERS DAY '95  /  NO. ${new Date().getFullYear()}`;
  ctx.font = `900 22px "Courier New", monospace`;
  const bw = ctx.measureText(badgeText).width + 44;
  const bh = 46;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);

  ctx.strokeStyle = THEME.green;
  ctx.lineWidth = 3;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

  ctx.fillStyle = THEME.green;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, 0, 1);

  ctx.restore();

  // Tagline — "Teacher, Ikaw naman." in bold italic
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tagY = y + h / 2 + 24;

  ctx.font = `italic 900 52px "Trebuchet MS", sans-serif`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = THEME.greenMid;
  ctx.strokeText(TAGLINE, cx, tagY);

  ctx.fillStyle = THEME.greenMid;
  ctx.fillText(TAGLINE, cx + 4, tagY + 4);

  ctx.fillStyle = THEME.white;
  ctx.fillText(TAGLINE, cx, tagY);

  // Date
  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 24px "Courier New", monospace`;
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    y + h - 30
  );

  // Retro barcode strip
  drawBarcode(ctx, x + 30, y + h - 16, 180, 10);
}

function drawBarcode(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = THEME.greenLight;
  const bars = [4, 2, 6, 2, 3, 5, 2, 4, 6, 3, 2, 5, 4, 2, 6, 3, 2, 4, 5, 3, 2, 6];
  let cx = x;
  let i = 0;
  while (cx < x + w) {
    const bw = bars[i % bars.length];
    ctx.fillRect(cx, y, bw, h);
    cx += bw + 3;
    i++;
  }
  ctx.restore();
}

function drawNumberTag(ctx, x, y, text) {
  ctx.font = `900 24px "Courier New", monospace`;
  const padding = 16;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padding * 2;
  const boxH = 44;

  // shadow
  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(x + 4, y + 4, boxW, boxH);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(x, y, boxW, boxH);

  ctx.strokeStyle = THEME.white;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, boxW, boxH);

  ctx.fillStyle = THEME.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + boxW / 2, y + boxH / 2 + 1);
}

function drawStickerTag(ctx, x, y, text, rotateDeg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotateDeg * Math.PI) / 180);

  ctx.font = `900 22px "Courier New", monospace`;
  const padding = 18;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padding * 2;
  const boxH = 44;

  ctx.fillStyle = THEME.white;
  ctx.fillRect(-4, -4, boxW + 8, boxH + 8);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(0, 0, boxW, boxH);

  ctx.fillStyle = THEME.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, boxW / 2, boxH / 2 + 1);

  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawImageCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx, sy, sw, sh;

  if (ir > tr) {
    sh = img.height;
    sw = sh * tr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / tr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }