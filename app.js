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
  greenDark:  '#1a4d2e',
  greenDeep:  '#0f2e1c',
  greenMid:   '#2d6a4f',
  greenSoft:  '#40916c',
  greenLight: '#d4e8db',
  cream:      '#ffffff',
  gold:       '#e8a83c'
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
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === selector.btn));

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
    headerSubtitle.textContent = 'Teacher, Ikaw naman.';
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
   SHARED DRAWING HELPERS - diagonal stripe dark green theme
   ================================================================ */

/* Diagonal stripe background — mimics the on-screen UI background */
function fillStripedBackground(ctx, w, h, baseColor, stripeColor, stripeWidth = 40) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = stripeColor;
  ctx.lineWidth = stripeWidth;
  ctx.globalAlpha = 0.55;

  const step = stripeWidth * 2;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.restore();
}

/* Outer decorative frame: cream outer border + green inner line + corner tabs */
function drawOuterFrame(ctx, w, h) {
  const OUTER = 16;
  const GAP = 6;
  const INNER = 4;

  // Outer cream border
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(0, 0, w, OUTER);
  ctx.fillRect(0, h - OUTER, w, OUTER);
  ctx.fillRect(0, 0, OUTER, h);
  ctx.fillRect(w - OUTER, 0, OUTER, h);

  // Inner green line
  ctx.fillStyle = THEME.greenDark;
  const inset = OUTER + GAP;
  ctx.fillRect(inset, inset, w - inset * 2, INNER);
  ctx.fillRect(inset, h - inset - INNER, w - inset * 2, INNER);
  ctx.fillRect(inset, inset, INNER, h - inset * 2);
  ctx.fillRect(w - inset - INNER, inset, INNER, h - inset * 2);

  // Corner tabs (small cream squares in the corners)
  const tabSize = 20;
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(OUTER, OUTER, tabSize, tabSize);
  ctx.fillRect(w - OUTER - tabSize, OUTER, tabSize, tabSize);
  ctx.fillRect(OUTER, h - OUTER - tabSize, tabSize, tabSize);
  ctx.fillRect(w - OUTER - tabSize, h - OUTER - tabSize, tabSize, tabSize);
}

/* Header block: dark green panel with subtle stripes, cream text */
function drawHeaderPanel(ctx, x, y, w, h, { tag, title, subtitle }) {
  // Shadow behind panel
  ctx.fillStyle = THEME.greenDeep;
  ctx.fillRect(x + 8, y + 8, w, h);

  // Panel with stripes
  fillStripedBackground(ctx, w, h, THEME.greenDark, THEME.greenMid, 30);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Re-draw stripes at correct offset by translating context
  ctx.translate(x, y);
  ctx.fillStyle = THEME.greenDark;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = THEME.greenMid;
  ctx.lineWidth = 30;
  ctx.globalAlpha = 0.55;
  for (let i = -h; i < w + h; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.restore();

  // Cream border inside panel
  ctx.strokeStyle = THEME.cream;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Small floating dots (memphis detail)
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = THEME.cream;
  const dots = [
    [w * 0.08, h * 0.25, 4],
    [w * 0.15, h * 0.75, 3],
    [w * 0.85, h * 0.30, 4],
    [w * 0.92, h * 0.70, 3],
    [w * 0.20, h * 0.20, 2],
    [w * 0.80, h * 0.80, 2]
  ];
  dots.forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Small play-triangles (left & right)
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = THEME.greenSoft;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.5);
  ctx.lineTo(w * 0.12, h * 0.4);
  ctx.lineTo(w * 0.12, h * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w * 0.94, h * 0.5);
  ctx.lineTo(w * 0.88, h * 0.4);
  ctx.lineTo(w * 0.88, h * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Tag (small cream box on top)
  ctx.font = '900 22px "Courier New", monospace';
  const tagW = ctx.measureText(tag).width + 44;
  const tagH = 42;
  const tagX = x + w / 2 - tagW / 2;
  const tagY = y + 24;

  ctx.fillStyle = THEME.cream;
  ctx.fillRect(tagX, tagY, tagW, tagH);

  ctx.fillStyle = THEME.greenDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, x + w / 2, tagY + tagH / 2 + 1);

  // Title
  ctx.font = '900 72px "Trebuchet MS", "Arial Black", sans-serif';
  ctx.fillStyle = THEME.cream;
  ctx.fillText(title, x + w / 2, y + h * 0.60);

  // Subtitle
  ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
  ctx.fillStyle = THEME.greenLight;
  ctx.fillText(subtitle, x + w / 2, y + h * 0.82);
}

/* Zig-zag divider strip (cream triangles pointing up) */
function drawZigZagDivider(ctx, x, y, w, height, color) {
  ctx.fillStyle = color;
  const teeth = 40;
  const toothW = w / teeth;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  for (let i = 0; i < teeth; i++) {
    const px = x + i * toothW;
    ctx.lineTo(px + toothW / 2, y);
    ctx.lineTo(px + toothW, y + height);
  }
  ctx.lineTo(x + w, y + height);
  ctx.closePath();
  ctx.fill();
}

/* Footer: dark green block with cream badge + tagline + date + barcode */
function drawFooterPanel(ctx, x, y, w, h) {
  // Solid dark green
  ctx.fillStyle = THEME.greenDark;
  ctx.fillRect(x, y, w, h);

  // Cream dashed top edge
  ctx.strokeStyle = THEME.cream;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 10);
  ctx.lineTo(x + w - 20, y + 10);
  ctx.stroke();
  ctx.setLineDash([]);

  const cx = x + w / 2;

  // Stamp badge — cream box with green text
  const stampText = `TEACHERS DAY  /  NO. ${new Date().getFullYear()}`;
  ctx.font = '900 22px "Courier New", monospace';
  const sw = ctx.measureText(stampText).width + 44;
  const sh = 44;
  const sy = y + 30;

  ctx.fillStyle = THEME.cream;
  ctx.fillRect(cx - sw / 2, sy, sw, sh);

  ctx.fillStyle = THEME.greenDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stampText, cx, sy + sh / 2 + 1);

  // Tagline
  ctx.font = 'italic 900 52px "Trebuchet MS", "Arial Black", sans-serif';
  ctx.fillStyle = THEME.cream;
  ctx.fillText(TAGLINE, cx, sy + sh + 60);

  // Date
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillStyle = THEME.greenLight;
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    y + h - 30
  );

  // Barcode (bottom left)
  drawBarcode(ctx, x + 20, y + h - 30, 200, 12, THEME.cream);
}

function drawBarcode(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  const bars = [4, 2, 6, 2, 3, 5, 2, 4, 6, 3, 2, 5, 4, 2, 6, 3, 2, 4, 5, 3, 2, 6];
  let cx = x;
  let i = 0;
  while (cx < x + w) {
    const bw = bars[i % bars.length];
    ctx.fillRect(cx, y, bw, h);
    cx += bw + 3;
    i++;
  }
}

/* Small cream number tag for photo corners */
function drawNumberTag(ctx, x, y, text) {
  ctx.font = '900 22px "Courier New", monospace';
  const pad = 14;
  const tw = ctx.measureText(text).width;
  const bw = tw + pad * 2;
  const bh = 40;

  ctx.fillStyle = THEME.cream;
  ctx.fillRect(x, y, bw, bh);

  ctx.fillStyle = THEME.greenDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + bw / 2, y + bh / 2 + 1);
}

/* ================================================================
   FUN STRIP
   ================================================================ */
async function generateFunStrip(imgs) {
  const W = 1200;
  const PAD = 70;
  const GAP = 46;
  const PHOTO_SIZE = W - PAD * 2;
  const FOOTER_H = 240;
  const HEADER_H = 320;
  const FRAME = 16; // outer frame thickness

  const H = FRAME + HEADER_H + 30 + (PHOTO_SIZE * 3) + (GAP * 2) + 30 + FOOTER_H + FRAME;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Striped background (the whole canvas)
  fillStripedBackground(ctx, W, H, THEME.greenDark, THEME.greenMid, 40);

  // Outer decorative frame
  drawOuterFrame(ctx, W, H);

  // Header panel
  drawHeaderPanel(ctx, PAD, FRAME + 30, W - PAD * 2, HEADER_H, {
    tag: 'TEACHERS DAY',
    title: 'HAPPY TEACHERS DAY',
    subtitle: 'SMILE, YOU LOOK GREAT TODAY'
  });

  // Zig-zag divider under header
  drawZigZagDivider(ctx, PAD, FRAME + 30 + HEADER_H, W - PAD * 2, 20, THEME.greenDark);

  // Photos
  const photosStartY = FRAME + 30 + HEADER_H + 50;

  for (let i = 0; i < 3; i++) {
    const y = photosStartY + i * (PHOTO_SIZE + GAP);

    // Cream outer frame around photo (with green inner line)
    ctx.fillStyle = THEME.cream;
    ctx.fillRect(PAD - 12, y - 12, PHOTO_SIZE + 24, PHOTO_SIZE + 24);

    ctx.fillStyle = THEME.greenDark;
    ctx.fillRect(PAD - 6, y - 6, PHOTO_SIZE + 12, PHOTO_SIZE + 12);

    // Photo
    const img = await loadImage(imgs[i]);
    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // Number tag
    drawNumberTag(ctx, PAD + 16, y + 16, String(i + 1).padStart(2, '0'));
  }

  // Zig-zag divider above footer
  const footerY = H - FRAME - FOOTER_H;
  drawZigZagDivider(ctx, PAD, footerY - 20, W - PAD * 2, 20, THEME.greenDark);

  // Footer panel
  drawFooterPanel(ctx, PAD, footerY, W - PAD * 2, FOOTER_H);

  return canvas.toDataURL('image/png');
}

/* ================================================================
   DEPARTMENT IMAGE
   ================================================================ */
async function generateDepartmentImage(imgSrc, departmentName) {
  const W = 1800;
  const H = 1200;
  const PAD = 70;
  const FRAME = 16;
  const HEADER_H = 260;
  const FOOTER_H = 220;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Striped background
  fillStripedBackground(ctx, W, H, THEME.greenDark, THEME.greenMid, 46);

  // Outer frame
  drawOuterFrame(ctx, W, H);

  // Header panel
  const dept = (departmentName && departmentName.trim()) || 'DEPARTMENT';
  drawHeaderPanel(ctx, PAD, FRAME + 30, W - PAD * 2, HEADER_H, {
    tag: 'TEACHERS DAY',
    title: dept.toUpperCase(),
    subtitle: 'ONE TEAM. ONE FAMILY.'
  });

  // Zig-zag divider under header
  drawZigZagDivider(ctx, PAD, FRAME + 30 + HEADER_H, W - PAD * 2, 22, THEME.greenDark);

  // Photo area
  const photoY = FRAME + 30 + HEADER_H + 60;
  const photoH = H - photoY - FOOTER_H - 60;
  const photoX = PAD;
  const photoW = W - PAD * 2;

  // Cream outer frame
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(photoX - 12, photoY - 12, photoW + 24, photoH + 24);

  // Green inner line
  ctx.fillStyle = THEME.greenDark;
  ctx.fillRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);

  const img = await loadImage(imgSrc);
  drawImageCover(ctx, img, photoX, photoY, photoW, photoH);

  // Number tag
  drawNumberTag(ctx, photoX + 20, photoY + 20, '01');

  // Zig-zag above footer
  const footerY = H - FRAME - FOOTER_H;
  drawZigZagDivider(ctx, PAD, footerY - 22, W - PAD * 2, 22, THEME.greenDark);

  // Footer
  drawFooterPanel(ctx, PAD, footerY, W - PAD * 2, FOOTER_H);

  return canvas.toDataURL('image/png');
}

/* ---------- HELPERS ---------- */
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