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
  greenDark: '#0d3b1f',
  greenMid:  '#1a4d2e',
  greenSoft: '#2d6a4f',
  cream:     '#f5f5f0',
  white:     '#ffffff',
  gold:      '#e8a83c'
};

const TAGLINE = 'Teacher, Ikaw Naman!';

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
    headerSubtitle.textContent = 'Teacher, Ikaw Naman!';
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

  // Reset transform so no state leaks into subsequent draws
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
   IMAGE GENERATION - dark green theme
   ================================================================ */

function drawTitleBlock(ctx, cx, topY, size = 100) {
  const lines = ["TEACHER'S DAY", 'CELEBRATION'];
  const lineHeight = size * 1.05;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  ctx.lineJoin = 'round';

  lines.forEach((line, i) => {
    const ly = topY + i * lineHeight + lineHeight / 2;

    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = THEME.greenDark;
    ctx.strokeText(line, cx, ly);

    ctx.fillStyle = THEME.cream;
    ctx.fillText(line, cx, ly);
  });

  return topY + lines.length * lineHeight;
}

function drawTagline(ctx, cx, centerY, size = 74) {
  ctx.font = `italic 900 ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const w = ctx.measureText(TAGLINE).width;
  const padX = 32;
  const padY = size * 0.45;

  // Green plate behind tagline
  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(cx - w / 2 - padX, centerY - padY, w + padX * 2, padY * 2);

  // Cream stroke
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = THEME.cream;
  ctx.strokeText(TAGLINE, cx, centerY);

  // Gold fill
  ctx.fillStyle = THEME.gold;
  ctx.fillText(TAGLINE, cx, centerY);

  return centerY + padY;
}

function drawFooterStrip(ctx, x, y, w, h) {
  ctx.fillStyle = THEME.greenDark;
  ctx.fillRect(x, y, w, h);

  const cx = x + w / 2;

  const stampText = `TEACHERS DAY  /  NO. ${new Date().getFullYear()}`;
  ctx.font = '900 22px "Courier New", monospace';
  const sw = ctx.measureText(stampText).width + 44;
  const sh = 46;
  const sy = y + (h - sh - 40) / 2;

  // Cream badge
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(cx - sw / 2, sy, sw, sh);

  ctx.fillStyle = THEME.greenDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stampText, cx, sy + sh / 2 + 1);

  // Date
  ctx.fillStyle = THEME.cream;
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    sy + sh + 30
  );
}

/* ================================================================
   FUN STRIP
   ================================================================ */
async function generateFunStrip(imgs) {
  const W = 1200;
  const PAD = 70;
  const GAP = 46;
  const PHOTO_SIZE = W - PAD * 2;
  const FOOTER_H = 200;

  const TITLE_SIZE = 104;
  const titleTop = 60;
  const titleBottom = titleTop + TITLE_SIZE * 1.05 * 2;
  const taglineCenterY = titleBottom + 60;
  const taglineBottom = taglineCenterY + TITLE_SIZE * 0.45 * 0.9;
  const HEADER_H = taglineBottom + 40;

  const H = HEADER_H + (PHOTO_SIZE * 3) + (GAP * 2) + FOOTER_H + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Dark green background
  ctx.fillStyle = THEME.greenDark;
  ctx.fillRect(0, 0, W, H);

  drawTitleBlock(ctx, W / 2, titleTop, TITLE_SIZE);
  drawTagline(ctx, W / 2, taglineCenterY, 78);

  const photosStartY = HEADER_H + 20;

  for (let i = 0; i < 3; i++) {
    const y = photosStartY + i * (PHOTO_SIZE + GAP);
    const img = await loadImage(imgs[i]);

    // Soft green offset shadow
    ctx.fillStyle = THEME.greenSoft;
    ctx.fillRect(PAD + 8, y + 8, PHOTO_SIZE, PHOTO_SIZE);

    // Cream frame
    ctx.fillStyle = THEME.cream;
    ctx.fillRect(PAD - 6, y - 6, PHOTO_SIZE + 12, PHOTO_SIZE + 12);

    // Photo
    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // Number badge
    const bx = PAD + 46;
    const by = y + 46;
    const br = 24;

    ctx.fillStyle = THEME.greenDark;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = THEME.cream;
    ctx.font = '900 20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), bx, by + 1);
  }

  drawFooterStrip(ctx, 0, H - FOOTER_H, W, FOOTER_H);

  return canvas.toDataURL('image/png');
}

/* ================================================================
   DEPARTMENT - photo-dominant layout
   ================================================================ */
async function generateDepartmentImage(imgSrc, departmentName) {
  const W = 1800;
  const H = 1200;
  const PAD = 60;
  const FOOTER_H = 160;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Dark green background
  ctx.fillStyle = THEME.greenDark;
  ctx.fillRect(0, 0, W, H);

  const TITLE_SIZE = 96;
  const titleTop = 50;
  const titleBottomY = drawTitleBlock(ctx, W / 2, titleTop, TITLE_SIZE);

  const taglineCenterY = titleBottomY + 50;
  const taglineBottomY = drawTagline(ctx, W / 2, taglineCenterY, 72);

  const dept = (departmentName && departmentName.trim()) || 'DEPARTMENT';
  const badgeText = dept.toUpperCase();

  ctx.font = '900 36px "Trebuchet MS", "Arial Black", sans-serif';
  const bw = ctx.measureText(badgeText).width + 64;
  const bh = 60;
  const bx = W / 2 - bw / 2;
  const by = taglineBottomY + 30;

  // Soft green shadow
  ctx.fillStyle = THEME.greenSoft;
  ctx.fillRect(bx + 8, by + 8, bw, bh);

  // Cream badge
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(bx, by, bw, bh);

  ctx.fillStyle = THEME.greenDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, W / 2, by + bh / 2 + 2);

  const photoY = by + bh + 40;
  const photoH = H - photoY - FOOTER_H - 40;
  const photoX = PAD;
  const photoW = W - PAD * 2;

  // Soft green offset shadow
  ctx.fillStyle = THEME.greenSoft;
  ctx.fillRect(photoX + 8, photoY + 8, photoW, photoH);

  // Cream outline
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(photoX - 5, photoY - 5, photoW + 10, photoH + 10);

  const img = await loadImage(imgSrc);
  drawImageCover(ctx, img, photoX, photoY, photoW, photoH);

  const tagX = photoX + 46;
  const tagY = photoY + 46;
  const tagR = 24;

  ctx.fillStyle = THEME.greenDark;
  ctx.beginPath();
  ctx.arc(tagX, tagY, tagR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = THEME.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tagX, tagY, tagR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = THEME.cream;
  ctx.font = '900 20px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('01', tagX, tagY + 1);

  drawFooterStrip(ctx, 0, H - FOOTER_H, W, FOOTER_H);

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