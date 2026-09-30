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
let mode = 'fun'; // 'fun' | 'department'
let stream = null;
let photos = [];
let facingMode = 'user';

const THEME = {
  green: '#1a4d2e',
  greenMid: '#2d6a4f',
  greenLight: '#d4e8db',
  white: '#ffffff'
};

/* ---------- POPULATE DEPARTMENT LIST ---------- */
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

  // reset session
  photos = [];
  results.innerHTML = '';
  results.classList.toggle('single', mode === 'department');
  actions.style.display = 'none';
  captureBtn.disabled = !stream;
  captureBtn.textContent = mode === 'department' ? 'Take Photo' : 'Take Photo';

  // toggle department panel
  deptPanel.style.display = mode === 'department' ? 'block' : 'none';

  // update header copy
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
   IMAGE GENERATION
   ================================================================ */

/**
 * FUN SHOTS - vertical 3-photo strip (portrait).
 * Aspect ratio roughly 1:2.7 to mimic a classic photobooth strip.
 */
async function generateFunStrip(imgs) {
  const W = 1200;          // strip width
  const HEADER_H = 320;
  const FOOTER_H = 200;
  const PAD = 60;          // outer padding
  const GAP = 40;
  const PHOTO_SIZE = W - PAD * 2; // square photos
  const H = HEADER_H + PAD + (PHOTO_SIZE * 3) + (GAP * 2) + FOOTER_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background
  ctx.fillStyle = THEME.white;
  ctx.fillRect(0, 0, W, H);

  // outer chunky border
  drawChunkyBorder(ctx, 0, 0, W, H, 18, THEME.green, 6);

  // corner triangles
  drawCornerAccents(ctx, 0, 0, W, H, 90, THEME.green);

  // header block
  const hx = 30, hy = 30, hw = W - 60, hh = HEADER_H - 60;
  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, hy, hw, hh);

  // hard shadow under header
  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 12, hy + hh, hw, 12);

  drawHeaderText(ctx, hx, hy, hw, hh, 'With Gratitude', 'Happy Teachers Day', 'Thank You For Everything');

  // photos
  const startY = HEADER_H + 20;
  for (let i = 0; i < 3; i++) {
    const y = startY + i * (PHOTO_SIZE + GAP);
    const img = await loadImage(imgs[i]);

    // sticker shadow
    ctx.fillStyle = THEME.greenLight;
    ctx.fillRect(PAD + 14, y + 14, PHOTO_SIZE, PHOTO_SIZE);

    // frame
    ctx.fillStyle = THEME.green;
    ctx.fillRect(PAD - 8, y - 8, PHOTO_SIZE + 16, PHOTO_SIZE + 16);

    // photo
    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // number tag
    drawNumberTag(ctx, PAD + 4, y + 4, String(i + 1).padStart(2, '0'));
  }

  // footer
  const fy = H - FOOTER_H;
  ctx.fillStyle = THEME.green;
  ctx.fillRect(30, fy, W - 60, FOOTER_H - 30);

  // zig-zag top edge of footer
  drawZigZag(ctx, 30, fy - 16, W - 60, 16, THEME.green);

  drawFooterText(ctx, 30, fy, W - 60, FOOTER_H - 30);

  return canvas.toDataURL('image/png');
}

/**
 * DEPARTMENT - single big landscape photo with banner template.
 */
async function generateDepartmentImage(imgSrc, departmentName) {
  const W = 1800;
  const H = 1350; // 4:3
  const PAD = 70;
  const HEADER_H = 260;
  const FOOTER_H = 220;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background
  ctx.fillStyle = THEME.white;
  ctx.fillRect(0, 0, W, H);

  // chunky border
  drawChunkyBorder(ctx, 0, 0, W, H, 22, THEME.green, 8);

  // corner accents
  drawCornerAccents(ctx, 0, 0, W, H, 130, THEME.green);

  // header banner
  const hx = 40, hy = 40, hw = W - 80, hh = HEADER_H - 60;
  ctx.fillStyle = THEME.green;
  ctx.fillRect(hx, hy, hw, hh);

  ctx.fillStyle = THEME.greenMid;
  ctx.fillRect(hx + 14, hy + hh, hw, 14);

  // header text (customized for department)
  const dept = (departmentName && departmentName.trim()) || 'Department';
  drawHeaderText(
    ctx, hx, hy, hw, hh,
    'Teachers Day 1995',
    dept.toUpperCase(),
    'One Team. One Family.'
  );

  // photo area
  const photoY = hy + hh + 60;
  const photoH = H - photoY - FOOTER_H - 60;
  const photoX = PAD;
  const photoW = W - PAD * 2;

  // sticker shadow
  ctx.fillStyle = THEME.greenLight;
  ctx.fillRect(photoX + 18, photoY + 18, photoW, photoH);

  // frame
  ctx.fillStyle = THEME.green;
  ctx.fillRect(photoX - 12, photoY - 12, photoW + 24, photoH + 24);

  // draw the photo (cover-fit)
  const img = await loadImage(imgSrc);
  drawImageCover(ctx, img, photoX, photoY, photoW, photoH);

  // footer
  const fy = H - FOOTER_H;
  ctx.fillStyle = THEME.green;
  ctx.fillRect(40, fy, W - 80, FOOTER_H - 40);

  // zig-zag top
  drawZigZag(ctx, 40, fy - 18, W - 80, 18, THEME.green);

  // footer content
  ctx.fillStyle = THEME.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = W / 2;

  // stamp box
  drawStampBox(ctx, cx, fy + 55, `No. ${new Date().getFullYear()}`);

  // message
  ctx.fillStyle = THEME.white;
  ctx.font = `bold 44px "Trebuchet MS", sans-serif`;
  ctx.fillText('THANK YOU FOR EVERYTHING', cx, fy + 125);

  // date
  ctx.fillStyle = THEME.greenLight;
  ctx.font = `28px "Courier New", monospace`;
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    fy + 165
  );

  return canvas.toDataURL('image/png');
}

/* ---------- DRAWING HELPERS ---------- */

function drawChunkyBorder(ctx, x, y, w, h, thickness, color, innerThickness) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);              // top
  ctx.fillRect(x, y + h - thickness, w, thickness); // bottom
  ctx.fillRect(x, y, thickness, h);              // left
  ctx.fillRect(x + w - thickness, y, thickness, h); // right

  if (innerThickness) {
    const inset = thickness + 12;
    ctx.strokeStyle = THEME.greenMid;
    ctx.lineWidth = innerThickness;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }
}

function drawCornerAccents(ctx, x, y, w, h, size, color) {
  ctx.fillStyle = color;
  // top-left
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();
  // top-right
  ctx.beginPath();
  ctx.moveTo(x + w - size, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + size);
  ctx.closePath();
  ctx.fill();
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(x, y + h - size);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + size, y + h);
  ctx.closePath();
  ctx.fill();
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(x + w - size, y + h - size);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - size, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawZigZag(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  const teeth = 30;
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

function drawHeaderText(ctx, x, y, w, h, eyebrow, title, subtitle) {
  const cx = x + w / 2;

  // eyebrow
  ctx.fillStyle = THEME.greenLight;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 22px "Trebuchet MS", sans-serif`;
  ctx.fillText(eyebrow.toUpperCase(), cx, y + h * 0.22);

  // title - split into 2 lines if it has spaces and is long
  ctx.fillStyle = THEME.white;
  ctx.font = `900 64px "Trebuchet MS", sans-serif`;

  const lines = title.split(' ').length > 2 ? splitIntoTwoLines(title) : [title];
  const lineHeight = 70;
  const startY = y + h / 2 + (lines.length === 1 ? 0 : -lineHeight / 2);

  lines.forEach((line, i) => {
    ctx.fillStyle = THEME.greenMid;
    ctx.fillText(line.toUpperCase(), cx + 3, startY + i * lineHeight + 3);
    ctx.fillStyle = THEME.white;
    ctx.fillText(line.toUpperCase(), cx, startY + i * lineHeight);
  });

  // subtitle
  ctx.fillStyle = THEME.greenLight;
  ctx.font = `bold 22px "Trebuchet MS", sans-serif`;
  ctx.fillText(subtitle.toUpperCase(), cx, y + h * 0.83);
}

function splitIntoTwoLines(text) {
  const words = text.split(' ');
  const mid = Math.ceil(words.length / 2);
  return [
    words.slice(0, mid).join(' '),
    words.slice(mid).join(' ')
  ];
}

function drawFooterText(ctx, x, y, w, h) {
  const cx = x + w / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // stamp
  drawStampBox(ctx, cx, y + 55, `No. ${new Date().getFullYear()}`);

  // message
  ctx.fillStyle = THEME.white;
  ctx.font = `bold 40px "Trebuchet MS", sans-serif`;
  ctx.fillText('THANK YOU FOR EVERYTHING', cx, y + 125);

  // date
  ctx.fillStyle = THEME.greenLight;
  ctx.font = `26px "Courier New", monospace`;
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    y + h - 10
  );
}

function drawStampBox(ctx, cx, cy, text) {
  ctx.font = `bold 24px "Courier New", monospace`;
  const padding = 20;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padding * 2;
  const boxH = 50;

  ctx.strokeStyle = THEME.greenLight;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  ctx.setLineDash([]);

  ctx.fillStyle = THEME.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
}

function drawNumberTag(ctx, x, y, text) {
  ctx.font = `900 22px "Courier New", monospace`;
  const padding = 14;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padding * 2;
  const boxH = 40;

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