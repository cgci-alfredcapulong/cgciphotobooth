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
const cameraWrapper = document.querySelector('.camera-wrapper');

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

const TAGLINE = 'Teacher, Ikaw naman.';

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

  if (cameraWrapper) {
    cameraWrapper.classList.toggle('landscape', mode === 'department');
  }

  if (mode === 'department') {
    headerTitle.textContent = 'Department Photo';
    headerSubtitle.textContent = 'One for the whole team';
  } else {
    headerTitle.textContent = 'Teachers Day Photobooth';
    headerSubtitle.textContent = 'Smile, you look great today';
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
        width: { ideal: 1920 },
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

/**
 * Capture the current video frame.
 * - Fun mode: square 1:1 (1200 x 1200)
 * - Department mode: landscape 7:5 (1680 x 1200) — matches 5x7 print & template slot
 */
function captureFrame() {
  const targetW = mode === 'department' ? 1680 : 1200;
  const targetH = mode === 'department' ? 1200 : 1200;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const targetRatio = targetW / targetH;
  const videoRatio = vw / vh;

  let sx, sy, sw, sh;

  if (videoRatio > targetRatio) {
    sh = vh;
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / targetRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  if (facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

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
   IMAGE GENERATION
   ================================================================ */

/* ---------------- FUN STRIP (vertical, square photos) ---------- */
async function generateFunStrip(imgs) {
  const W = 1200;
  const HEADER_H = 360;
  const FOOTER_H = 260;
  const PAD = 50;
  const GAP = 40;
  const PHOTO_SIZE = W - PAD * 2;
  const H = HEADER_H + PAD / 2 + (PHOTO_SIZE * 3) + (GAP * 2) + FOOTER_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = THEME.white;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = THEME.greenPale;
  ctx.fillRect(20, 20, W - 40, H - 40);

  drawChunkyBorder(ctx, 0, 0, W, H, 22, THEME.green, 5);

  drawMemphisBackdrop(ctx, 0, 0, W, H);

  drawCornerAccents(ctx, 0, 0, W, H, 110, THEME.green, THEME.greenMid);

  /* ---------- HEADER ---------- */
  const hx = 50, hy = 50, hw = W - 100, hh = HEADER_H - 70;

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 16, hy + 16, hw, hh);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, hy, hw, hh);

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

  drawMemphisDots(ctx, hx, hy, hw, hh);

  drawRetroHeader(ctx, hx, hy, hw, hh, {
    eyebrow: 'TEACHERS DAY',
    title: 'HAPPY TEACHERS DAY',
    subtitle: 'SMILE, YOU LOOK GREAT TODAY'
  });

  drawZigZag(ctx, hx, hy + hh, hw, 22, THEME.green, 26);

  /* ---------- PHOTOS ---------- */
  const startY = HEADER_H + 10;

  for (let i = 0; i < 3; i++) {
    const y = startY + i * (PHOTO_SIZE + GAP);
    const img = await loadImage(imgs[i]);

    ctx.fillStyle = THEME.greenLight;
    ctx.fillRect(PAD + 12, y + 12, PHOTO_SIZE, PHOTO_SIZE);

    ctx.fillStyle = THEME.green;
    ctx.fillRect(PAD - 8, y - 8, PHOTO_SIZE + 16, PHOTO_SIZE + 16);

    ctx.fillStyle = THEME.white;
    ctx.fillRect(PAD - 3, y - 3, PHOTO_SIZE + 6, PHOTO_SIZE + 6);

    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    ctx.strokeStyle = THEME.green;
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    drawNumberTag(ctx, PAD + 12, y + 12, String(i + 1).padStart(2, '0'));
  }

  /* ---------- FOOTER ---------- */
  const fy = H - FOOTER_H - 10;

  drawZigZag(ctx, 50, fy - 22, W - 100, 22, THEME.green, 26);

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(66, fy + 16, W - 132, FOOTER_H - 60);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(50, fy, W - 100, FOOTER_H - 60);

  drawRetroFooter(ctx, 50, fy, W - 100, FOOTER_H - 60);

  return canvas.toDataURL('image/png');
}

/* ---------------- DEPARTMENT (framed, landscape 7:5) --------------- */
async function generateDepartmentImage(imgSrc, departmentName) {
  // 7:5 aspect = exactly 5x7 landscape at 300 DPI
  const W = 2100;
  const H = 1500;

  const FRAME = 28;
  const FRAME_INNER = 4;
  const CONTENT_PAD = 44;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  /* ---------- BACKGROUND ---------- */
  ctx.fillStyle = THEME.greenPale;
  ctx.fillRect(0, 0, W, H);

  /* ---------- DECORATIVE FRAME ---------- */
  drawChunkyBorder(ctx, 0, 0, W, H, FRAME, THEME.green, 0);

  ctx.strokeStyle = THEME.greenMid;
  ctx.lineWidth = FRAME_INNER;
  const lineInset = FRAME + 6;
  ctx.strokeRect(lineInset, lineInset, W - lineInset * 2, H - lineInset * 2);

  const matInset = FRAME + 12;
  ctx.fillStyle = THEME.white;
  ctx.fillRect(matInset, matInset, W - matInset * 2, H - matInset * 2);

  drawCornerAccents(
    ctx,
    matInset,
    matInset,
    W - matInset * 2,
    H - matInset * 2,
    80,
    THEME.green,
    THEME.greenMid
  );

  /* ---------- CONTENT BOUNDS ---------- */
  const contentX = matInset + CONTENT_PAD;
  const contentY = matInset + CONTENT_PAD;
  const contentW = W - (matInset + CONTENT_PAD) * 2;
  const contentH = H - (matInset + CONTENT_PAD) * 2;

  /* ---------- HEADER (short, left-aligned) ---------- */
  const HEADER_H = 104;
  const hx = contentX;
  const hy = contentY;
  const hw = contentW;
  const hh = HEADER_H;

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 8, hy + 8, hw, hh);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, hy, hw, hh);

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

  const dept = (departmentName && departmentName.trim()) || 'Department';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 20px "Trebuchet MS", sans-serif`;
  ctx.fillText('TEACHERS DAY', hx + 36, hy + 28);

  ctx.fillStyle = THEME.white;
  ctx.font = `900 50px "Trebuchet MS", sans-serif`;
  const titleLines = fitTitleLines(ctx, dept.toUpperCase(), hw - 420, 50);
  const titleLineH = 54;
  const titleStartY = hy + 60 + (titleLines.length === 1 ? 10 : 0);

  titleLines.forEach((line, i) => {
    ctx.fillText(line, hx + 36, titleStartY + i * titleLineH);
  });

  ctx.font = `italic 900 32px "Trebuchet MS", sans-serif`;
  const tagText = TAGLINE;
  const tagW = ctx.measureText(tagText).width + 44;
  const tagH = 60;
  const tagX = hx + hw - tagW - 36;
  const tagY = hy + (hh - tagH) / 2;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(tagX, tagY, tagW, tagH);

  ctx.strokeStyle = THEME.green;
  ctx.lineWidth = 3;
  ctx.strokeRect(tagX, tagY, tagW, tagH);

  ctx.fillStyle = THEME.green;
  ctx.textAlign = 'center';
  ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2 + 2);

  /* ---------- FOOTER (short, left + right aligned) ---------- */
  const FOOTER_H = 86;
  const fy = contentY + contentH - FOOTER_H;

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 8, fy + 8, hw, FOOTER_H - 8);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, fy, hw, FOOTER_H - 8);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const badgeText = `NO. ${new Date().getFullYear()}`;
  ctx.font = `900 24px "Courier New", monospace`;
  const badgeW = ctx.measureText(badgeText).width + 44;
  const badgeH = 44;
  const badgeX = hx + 36;
  const badgeY = fy + (FOOTER_H - 8 - badgeH) / 2;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

  ctx.strokeStyle = THEME.green;
  ctx.lineWidth = 2;
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

  ctx.fillStyle = THEME.green;
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 22px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(
    'ONE TEAM. ONE FAMILY.',
    hx + hw / 2,
    fy + (FOOTER_H - 8) / 2
  );

  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 20px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    hx + hw - 36,
    fy + (FOOTER_H - 8) / 2
  );

  /* ---------- PHOTO (7:5 slot, matches capture & 5x7 print) ---------- */
  const slotTop = hy + hh + 28;
  const slotBottom = fy - 28;
  const slotMaxH = slotBottom - slotTop;
  const slotMaxW = contentW;

  // Build the largest 7:5 rectangle that fits in available space
  let photoW = slotMaxW;
  let photoH = photoW * 5 / 7;

  if (photoH > slotMaxH) {
    photoH = slotMaxH;
    photoW = photoH * 7 / 5;
  }

  const photoX = contentX + (contentW - photoW) / 2;
  const photoY = slotTop + (slotMaxH - photoH) / 2;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(photoX + 10, photoY + 10, photoW, photoH);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(photoX - 8, photoY - 8, photoW + 16, photoH + 16);

  ctx.fillStyle = THEME.white;
  ctx.fillRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);

  const img = await loadImage(imgSrc);
  drawImageContain(ctx, img, photoX, photoY, photoW, photoH, THEME.greenPale);

  ctx.strokeStyle = THEME.green;
  ctx.lineWidth = 2;
  ctx.strokeRect(photoX, photoY, photoW, photoH);

  drawStickerTag(ctx, photoX + 24, photoY + 24, 'PHOTO 01', -4);

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
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 16);
  ctx.lineTo(x + size * 0.55, y + 16);
  ctx.lineTo(x + 16, y + size * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + w - size, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + w - 16, y + 16);
  ctx.lineTo(x + w - size * 0.55, y + 16);
  ctx.lineTo(x + w - 16, y + size * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h - size);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + size, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + h - 16);
  ctx.lineTo(x + 16, y + h - size * 0.55);
  ctx.lineTo(x + size * 0.55, y + h - 16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + w - size, y + h - size);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - size, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(x + w - 16, y + h - 16);
  ctx.lineTo(x + w - 16, y + h - size * 0.55);
  ctx.lineTo(x + w - size * 0.55, y + h - 16);
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
  ctx.save();
  ctx.globalAlpha = 0.35;

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

  ctx.font = `bold 20px "Trebuchet MS", sans-serif`;
  const eW = ctx.measureText(eyebrow).width;
  const tagW = eW + 40;
  const tagH = 38;
  const tagX = cx - tagW / 2;
  const tagY = y + 16;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(tagX, tagY, tagW, tagH);
  ctx.fillStyle = THEME.green;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 20px "Trebuchet MS", sans-serif`;
  ctx.fillText(eyebrow, cx, tagY + tagH / 2 + 1);

  const lines = fitTitleLines(ctx, title, w - 120, 60);
  const lineHeight = 66;
  const totalH = lines.length * lineHeight;
  const startY = y + h / 2 - totalH / 2 + 20;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight + lineHeight / 2;

    ctx.font = `900 60px "Trebuchet MS", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = THEME.greenMid;
    ctx.strokeText(line, cx, ly);

    ctx.fillStyle = THEME.greenMid;
    ctx.fillText(line, cx + 4, ly + 4);

    ctx.fillStyle = THEME.white;
    ctx.fillText(line, cx, ly);
  });

  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 20px "Trebuchet MS", sans-serif`;
  ctx.fillText(subtitle, cx, y + h - 26);
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

  ctx.save();
  ctx.translate(cx, y + 36);
  ctx.rotate(-1.5 * Math.PI / 180);

  const badgeText = `TEACHERS DAY  /  NO. ${new Date().getFullYear()}`;
  ctx.font = `900 18px "Courier New", monospace`;
  const bw = ctx.measureText(badgeText).width + 36;
  const bh = 36;

  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);

  ctx.strokeStyle = THEME.green;
  ctx.lineWidth = 2;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

  ctx.fillStyle = THEME.green;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, 0, 1);

  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tagY = y + h / 2 + 12;

  ctx.font = `italic 900 38px "Trebuchet MS", sans-serif`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = THEME.greenMid;
  ctx.strokeText(TAGLINE, cx, tagY);

  ctx.fillStyle = THEME.greenMid;
  ctx.fillText(TAGLINE, cx + 3, tagY + 3);

  ctx.fillStyle = THEME.white;
  ctx.fillText(TAGLINE, cx, tagY);

  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 18px "Courier New", monospace`;
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    y + h - 18
  );

  drawBarcode(ctx, x + 24, y + h - 12, 140, 7);
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
  ctx.font = `900 22px "Courier New", monospace`;
  const padding = 14;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padding * 2;
  const boxH = 40;

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(x + 4, y + 4, boxW, boxH);

  ctx.fillStyle = THEME.green;
  ctx.fillRect(x, y, boxW, boxH);

  ctx.strokeStyle = THEME.white;
  ctx.lineWidth = 2;
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

  ctx.font = `900 20px "Courier New", monospace`;
  const padding = 16;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padding * 2;
  const boxH = 40;

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

function drawImageContain(ctx, img, x, y, w, h, bgColor) {
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);
  }

  const ir = img.width / img.height;
  const tr = w / h;

  let dw, dh;

  if (ir > tr) {
    dw = w;
    dh = w / ir;
  } else {
    dh = h;
    dw = h * ir;
  }

  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;

  ctx.drawImage(img, dx, dy, dw, dh);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }