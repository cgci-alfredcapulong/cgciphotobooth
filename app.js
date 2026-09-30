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
  cream:  '#f5efd0',
  mint:   '#a8d5c8',
  teal:   '#1e4d4a',
  coral:  '#e85c4a',
  peach:  '#f4a261',
  gold:   '#e8a83c',
  orange: '#e8862b',
  pink:   '#e85c8a',
  blue:   '#4a9fd8'
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
    headerSubtitle.textContent = "Est. 1995 / Teacher, Ikaw Naman!";
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
   IMAGE GENERATION - color scheme only, typography-driven
   ================================================================ */

/**
 * Shared title block used by both templates.
 * Draws: "TEACHER'S DAY / CELEBRATION" in cream on teal with a gold stroke.
 */
function drawTitleBlock(ctx, cx, startY, size = 100) {
  const lines = ["TEACHER'S DAY", 'CELEBRATION'];
  const lineHeight = size * 1.05;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  ctx.lineJoin = 'round';

  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight;

    // Gold outline
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = THEME.gold;
    ctx.strokeText(line, cx, ly);

    // Teal fill
    ctx.fillStyle = THEME.teal;
    ctx.fillText(line, cx, ly);
  });

  return startY + (lines.length - 1) * lineHeight + lineHeight * 0.55;
}

/**
 * Tagline: "Teacher, Ikaw Naman!" in orange italic with gold stroke
 * and a soft cream plate behind it.
 */
function drawTagline(ctx, cx, y, size = 74) {
  ctx.font = `italic 900 ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const w = ctx.measureText(TAGLINE).width;
  const padX = 28;
  const padY = size * 0.42;

  // Cream plate
  ctx.fillStyle = 'rgba(245, 239, 208, 0.9)';
  ctx.fillRect(cx - w / 2 - padX, y - padY, w + padX * 2, padY * 2);

  // Gold stroke
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = THEME.gold;
  ctx.strokeText(TAGLINE, cx, y);

  // Orange fill
  ctx.fillStyle = THEME.orange;
  ctx.fillText(TAGLINE, cx, y);
}

/**
 * Footer strip: mint band with a teal stamp badge, date, and coral/pink
 * accent bars on the sides. No decorative objects.
 */
function drawFooterStrip(ctx, x, y, w, h) {
  // Mint band
  ctx.fillStyle = THEME.mint;
  ctx.fillRect(x, y, w, h);

  const cx = x + w / 2;

  // Stamp badge
  const stampText = `TEACHERS DAY '95  /  NO. ${new Date().getFullYear()}`;
  ctx.font = '900 22px "Courier New", monospace';
  const sw = ctx.measureText(stampText).width + 44;
  const sh = 46;

  ctx.fillStyle = THEME.teal;
  ctx.fillRect(cx - sw / 2, y + 30, sw, sh);

  ctx.fillStyle = THEME.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stampText, cx, y + 30 + sh / 2 + 1);

  // Date
  ctx.fillStyle = THEME.teal;
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    y + h - 40
  );

  // Side accent bars
  ctx.fillStyle = THEME.coral;
  ctx.fillRect(x + 24, y + h / 2 - 30, 6, 60);
  ctx.fillRect(x + w - 30, y + h / 2 - 30, 6, 60);

  ctx.fillStyle = THEME.pink;
  ctx.fillRect(x + 36, y + h / 2 - 20, 4, 40);
  ctx.fillRect(x + w - 40, y + h / 2 - 20, 4, 40);
}

/* ================================================================
   FUN SHOTS - vertical 3-photo strip
   ================================================================ */
async function generateFunStrip(imgs) {
  const W = 1200;
  const HEADER_H = 420;
  const FOOTER_H = 220;
  const PAD = 70;
  const GAP = 46;
  const PHOTO_SIZE = W - PAD * 2;
  const H = HEADER_H + (PHOTO_SIZE * 3) + (GAP * 2) + FOOTER_H + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Cream background
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(0, 0, W, H);

  // Title
  const titleEndY = drawTitleBlock(ctx, W / 2, 130, 104);

  // Tagline
  drawTagline(ctx, W / 2, titleEndY + 40, 78);

  /* ---------- PHOTOS ---------- */
  const photosStartY = HEADER_H + 20;

  for (let i = 0; i < 3; i++) {
    const y = photosStartY + i * (PHOTO_SIZE + GAP);
    const img = await loadImage(imgs[i]);

    // Coral offset shadow
    ctx.fillStyle = THEME.coral;
    ctx.fillRect(PAD + 10, y + 10, PHOTO_SIZE, PHOTO_SIZE);

    // Teal frame
    ctx.fillStyle = THEME.teal;
    ctx.fillRect(PAD - 8, y - 8, PHOTO_SIZE + 16, PHOTO_SIZE + 16);

    // Photo
    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // Number badge in top-left (small teal circle with gold ring)
    const bx = PAD + 40;
    const by = y + 40;
    const br = 26;

    ctx.fillStyle = THEME.teal;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = THEME.cream;
    ctx.font = '900 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), bx, by + 1);
  }

  /* ---------- FOOTER ---------- */
  const footerY = H - FOOTER_H;
  drawFooterStrip(ctx, 0, footerY, W, FOOTER_H);

  return canvas.toDataURL('image/png');
}

/* ================================================================
   DEPARTMENT - single landscape photo, with photo given more room
   ================================================================ */
async function generateDepartmentImage(imgSrc, departmentName) {
  const W = 1800;
  const H = 1350;
  const PAD = 80;
  const HEADER_H = 360;
  const FOOTER_H = 180;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Cream background
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(0, 0, W, H);

  // Title
  const titleEndY = drawTitleBlock(ctx, W / 2, 120, 118);

  // Tagline
  drawTagline(ctx, W / 2, titleEndY + 46, 84);

  /* ---------- DEPARTMENT BADGE ---------- */
  const dept = (departmentName && departmentName.trim()) || 'DEPARTMENT';
  const badgeText = dept.toUpperCase();

  ctx.font = '900 40px "Trebuchet MS", "Arial Black", sans-serif';
  const bw = ctx.measureText(badgeText).width + 72;
  const bh = 68;
  const bx = W / 2 - bw / 2;
  const by = HEADER_H - 30;

  // Coral shadow
  ctx.fillStyle = THEME.coral;
  ctx.fillRect(bx + 8, by + 8, bw, bh);

  // Teal badge
  ctx.fillStyle = THEME.teal;
  ctx.fillRect(bx, by, bw, bh);

  ctx.fillStyle = THEME.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, W / 2, by + bh / 2 + 2);

  /* ---------- PHOTO - bigger, thinner frame ---------- */
  // Photo takes up almost all remaining space. Frame is a thin outline,
  // not a chunky border, so the photo itself dominates.
  const photoY = by + bh + 50;
  const photoH = H - photoY - FOOTER_H - 50;
  const photoX = PAD;
  const photoW = W - PAD * 2;

  // Thin coral offset shadow (subtle)
  ctx.fillStyle = THEME.coral;
  ctx.fillRect(photoX + 10, photoY + 10, photoW, photoH);

  // Thin teal outline (much thinner than before)
  ctx.fillStyle = THEME.teal;
  ctx.fillRect(photoX - 5, photoY - 5, photoW + 10, photoH + 10);

  const img = await loadImage(imgSrc);
  drawImageCover(ctx, img, photoX, photoY, photoW, photoH);

  // Small number badge
  const tagX = photoX + 46;
  const tagY = photoY + 46;
  const tagR = 26;

  ctx.fillStyle = THEME.teal;
  ctx.beginPath();
  ctx.arc(tagX, tagY, tagR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = THEME.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tagX, tagY, tagR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = THEME.cream;
  ctx.font = '900 22px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('01', tagX, tagY + 1);

  /* ---------- FOOTER ---------- */
  const footerY = H - FOOTER_H;
  drawFooterStrip(ctx, 0, footerY, W, FOOTER_H);

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