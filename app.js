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
  cream:      '#f5efd0',
  mint:       '#a8d5c8',
  teal:       '#1e4d4a',
  coral:      '#e85c4a',
  peach:      '#f4a261',
  gold:       '#e8a83c',
  orange:     '#e8862b',
  pink:       '#e85c8a',
  blue:       '#4a9fd8',
  black:      '#1a1a1a'
};

const TAGLINE = "Teacher, Ikaw Naman!";

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
   IMAGE GENERATION - 90's RETRO THEME
   ================================================================ */

async function generateFunStrip(imgs) {
  const W = 1200;
  const HEADER_H = 460;
  const FOOTER_H = 320;
  const PAD = 70;
  const GAP = 50;
  const PHOTO_SIZE = W - PAD * 2;
  const H = HEADER_H + (PHOTO_SIZE * 3) + (GAP * 2) + FOOTER_H + 60;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  /* ---------- BACKGROUND: cream with sunburst header ---------- */
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(0, 0, W, H);

  // Sunburst behind header (radiating from bottom-center of header)
  drawSunburst(ctx, W / 2, HEADER_H + 60, W * 1.1, HEADER_H + 120, [
    THEME.coral, THEME.peach, THEME.cream, THEME.mint
  ], 18);

  // Bottom mint strip behind footer
  ctx.fillStyle = THEME.mint;
  ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);

  // Right-side halftone dots (mint area)
  drawHalftone(ctx, W - 180, H - 180, 140, THEME.teal, 0.15);

  /* ---------- VINYL RECORDS ---------- */
  drawVinyl(ctx, 130, HEADER_H - 40, 90, THEME.black, THEME.pink);
  drawVinyl(ctx, W - 130, HEADER_H - 40, 90, THEME.black, THEME.blue);

  /* ---------- HEADER TITLE ---------- */
  const cx = W / 2;

  // Title — bold outlined 90's font, split into lines
  const titleLines = ['TEACHER\'S DAY', 'CELEBRATION'];
  const titleFont = '900 108px "Trebuchet MS", "Arial Black", sans-serif';
  ctx.font = titleFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineHeight = 120;
  const titleStartY = HEADER_H / 2 - 40;

  titleLines.forEach((line, i) => {
    const ly = titleStartY + i * lineHeight;

    // Gold outer stroke (the sticker outline)
    ctx.lineJoin = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22;
    ctx.strokeStyle = THEME.gold;
    ctx.strokeText(line, cx, ly);

    // Dark teal fill
    ctx.fillStyle = THEME.teal;
    ctx.fillText(line, cx, ly);
  });

  /* ---------- TAGLINE RIBBON ---------- */
  const tagY = HEADER_H - 20;

  ctx.font = 'italic 900 84px "Trebuchet MS", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Cream shadow behind tagline (the ribbon-ish plate)
  const tagText = TAGLINE;
  const tagWidth = ctx.measureText(tagText).width;
  ctx.fillStyle = 'rgba(245, 239, 208, 0.85)';
  ctx.fillRect(cx - tagWidth / 2 - 20, tagY - 55, tagWidth + 40, 110);

  // Gold stroke
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = THEME.gold;
  ctx.strokeText(tagText, cx, tagY);

  // Orange fill
  ctx.fillStyle = THEME.orange;
  ctx.fillText(tagText, cx, tagY);

  /* ---------- PHOTOS ---------- */
  const photosStartY = HEADER_H + 30;

  for (let i = 0; i < 3; i++) {
    const y = photosStartY + i * (PHOTO_SIZE + GAP);
    const img = await loadImage(imgs[i]);

    // Coral shadow offset (sticker effect)
    ctx.fillStyle = THEME.coral;
    ctx.fillRect(PAD + 14, y + 14, PHOTO_SIZE, PHOTO_SIZE);

    // Teal frame
    ctx.fillStyle = THEME.teal;
    ctx.fillRect(PAD - 12, y - 12, PHOTO_SIZE + 24, PHOTO_SIZE + 24);

    // Cream inner gutter
    ctx.fillStyle = THEME.cream;
    ctx.fillRect(PAD - 6, y - 6, PHOTO_SIZE + 12, PHOTO_SIZE + 12);

    // Photo
    ctx.drawImage(img, PAD, y, PHOTO_SIZE, PHOTO_SIZE);

    // Number tag — vinyl-style circle
    drawVinylTag(ctx, PAD + 50, y + 50, 44, String(i + 1).padStart(2, '0'));
  }

  /* ---------- BOOMBOX / CASSETTE in footer ---------- */
  drawBoombox(ctx, 90, H - FOOTER_H + 60, 240, 150);
  drawCassette(ctx, W - 330, H - FOOTER_H + 80, 240, 130);

  // Footer text
  const footerTextY = H - FOOTER_H / 2 + 10;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Small tag
  ctx.font = '900 22px "Courier New", monospace';
  const stampText = `TEACHERS DAY '95  /  NO. ${new Date().getFullYear()}`;
  const sw = ctx.measureText(stampText).width + 44;
  const sh = 46;
  const sx2 = cx - sw / 2;
  const sy2 = H - FOOTER_H + 30;

  ctx.fillStyle = THEME.teal;
  ctx.fillRect(sx2, sy2, sw, sh);
  ctx.fillStyle = THEME.cream;
  ctx.fillText(stampText, cx, sy2 + sh / 2 + 1);

  // Date
  ctx.fillStyle = THEME.teal;
  ctx.font = 'bold 24px "Courier New", monospace';
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    H - 40
  );

  return canvas.toDataURL('image/png');
}

async function generateDepartmentImage(imgSrc, departmentName) {
  const W = 1800;
  const H = 1350;
  const PAD = 70;
  const HEADER_H = 380;
  const FOOTER_H = 260;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  /* ---------- BACKGROUND ---------- */
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(0, 0, W, H);

  // Sunburst behind header
  drawSunburst(ctx, W / 2, HEADER_H + 60, W * 0.9, HEADER_H + 100, [
    THEME.coral, THEME.peach, THEME.cream, THEME.mint
  ], 24);

  // Mint strip behind footer
  ctx.fillStyle = THEME.mint;
  ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);

  // Halftone dots
  drawHalftone(ctx, W - 260, H - 220, 200, THEME.teal, 0.18);
  drawHalftone(ctx, 260, H - 220, 200, THEME.teal, 0.12);

  /* ---------- VINYL RECORDS ---------- */
  drawVinyl(ctx, 180, HEADER_H - 60, 110, THEME.black, THEME.pink);
  drawVinyl(ctx, W - 180, HEADER_H - 60, 110, THEME.black, THEME.blue);

  /* ---------- HEADER TITLE ---------- */
  const cx = W / 2;

  const titleFont = '900 130px "Trebuchet MS", "Arial Black", sans-serif';
  ctx.font = titleFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const titleLines = ['TEACHER\'S DAY', 'CELEBRATION'];
  const lineHeight = 145;
  const titleStartY = HEADER_H / 2 - 40;

  titleLines.forEach((line, i) => {
    const ly = titleStartY + i * lineHeight;

    ctx.lineJoin = 'round';
    ctx.lineWidth = 26;
    ctx.strokeStyle = THEME.gold;
    ctx.strokeText(line, cx, ly);

    ctx.fillStyle = THEME.teal;
    ctx.fillText(line, cx, ly);
  });

  /* ---------- TAGLINE ---------- */
  const tagY = HEADER_H - 20;
  ctx.font = 'italic 900 96px "Trebuchet MS", "Arial Black", sans-serif';

  const tagWidth = ctx.measureText(TAGLINE).width;
  ctx.fillStyle = 'rgba(245, 239, 208, 0.85)';
  ctx.fillRect(cx - tagWidth / 2 - 24, tagY - 60, tagWidth + 48, 120);

  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = THEME.gold;
  ctx.strokeText(TAGLINE, cx, tagY);

  ctx.fillStyle = THEME.orange;
  ctx.fillText(TAGLINE, cx, tagY);

  /* ---------- DEPARTMENT LABEL BADGE ---------- */
  const badgeY = HEADER_H + 60;
  ctx.font = '900 44px "Trebuchet MS", "Arial Black", sans-serif';
  const dept = (departmentName && departmentName.trim()) || 'DEPARTMENT';
  const badgeText = dept.toUpperCase();
  const bw = ctx.measureText(badgeText).width + 80;
  const bh = 76;

  // Coral shadow
  ctx.fillStyle = THEME.coral;
  ctx.fillRect(cx - bw / 2 + 10, badgeY + 10, bw, bh);

  // Teal badge
  ctx.fillStyle = THEME.teal;
  ctx.fillRect(cx - bw / 2, badgeY, bw, bh);

  ctx.fillStyle = THEME.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, cx, badgeY + bh / 2 + 2);

  /* ---------- PHOTO ---------- */
  const photoY = badgeY + bh + 40;
  const photoH = H - photoY - FOOTER_H - 40;
  const photoX = PAD;
  const photoW = W - PAD * 2;

  ctx.fillStyle = THEME.coral;
  ctx.fillRect(photoX + 18, photoY + 18, photoW, photoH);

  ctx.fillStyle = THEME.teal;
  ctx.fillRect(photoX - 14, photoY - 14, photoW + 28, photoH + 28);

  ctx.fillStyle = THEME.cream;
  ctx.fillRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);

  const img = await loadImage(imgSrc);
  drawImageCover(ctx, img, photoX, photoY, photoW, photoH);

  // Vinyl tag in corner of photo
  drawVinylTag(ctx, photoX + 60, photoY + 60, 54, '01');

  /* ---------- FOOTER ---------- */
  drawBoombox(ctx, 120, H - FOOTER_H + 70, 260, 160);
  drawCassette(ctx, W - 380, H - FOOTER_H + 90, 260, 140);

  const footerTextY = H - FOOTER_H / 2 + 20;

  ctx.font = '900 26px "Courier New", monospace';
  const stampText = `TEACHERS DAY '95  /  NO. ${new Date().getFullYear()}`;
  const sw = ctx.measureText(stampText).width + 50;
  const sh = 52;
  const sx2 = cx - sw / 2;
  const sy2 = H - FOOTER_H + 30;

  ctx.fillStyle = THEME.teal;
  ctx.fillRect(sx2, sy2, sw, sh);
  ctx.fillStyle = THEME.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 26px "Courier New", monospace';
  ctx.fillText(stampText, cx, sy2 + sh / 2 + 2);

  ctx.fillStyle = THEME.teal;
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
    cx,
    H - 40
  );

  return canvas.toDataURL('image/png');
}

/* ================================================================
   90's RETRO DRAWING PRIMITIVES
   ================================================================ */

function drawSunburst(ctx, cx, cy, radius, maxRadius, colors, segments) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, cy + 60);
  ctx.clip();

  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = i * step;
    const a1 = a0 + step;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(a0) * maxRadius,
      cy + Math.sin(a0) * maxRadius
    );
    ctx.lineTo(
      cx + Math.cos(a1) * maxRadius,
      cy + Math.sin(a1) * maxRadius
    );
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawHalftone(ctx, cx, cy, radius, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  const dotSpacing = 20;
  for (let y = -radius; y <= radius; y += dotSpacing) {
    for (let x = -radius; x <= radius; x += dotSpacing) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= radius) {
        const size = 2 + (1 - d / radius) * 4;
        ctx.beginPath();
        ctx.arc(cx + x, cy + y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawVinyl(ctx, cx, cy, radius, color, labelColor) {
  // Outer disc
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner grooves
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (let r = radius * 0.35; r < radius * 0.92; r += 4) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = labelColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();

  // Label inner ring
  ctx.strokeStyle = THEME.cream;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
  ctx.stroke();

  // Center hole
  ctx.fillStyle = THEME.cream;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // Highlight streak
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawVinylTag(ctx, cx, cy, radius, text) {
  // Small vinyl-styled number badge
  ctx.fillStyle = THEME.black;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  for (let r = radius * 0.4; r < radius * 0.9; r += 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = THEME.gold;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = THEME.teal;
  ctx.font = `900 ${Math.floor(radius * 0.6)}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);

  ctx.fillStyle = THEME.black;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoombox(ctx, x, y, w, h) {
  // Body
  ctx.fillStyle = THEME.pink;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();

  // Teal border
  ctx.strokeStyle = THEME.teal;
  ctx.lineWidth = 5;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();

  // Handle
  ctx.strokeStyle = THEME.teal;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y);
  ctx.quadraticCurveTo(x + w / 2, y - 30, x + w * 0.8, y);
  ctx.stroke();

  // Speakers (left and right circles)
  const spR = h * 0.32;
  const spY = y + h * 0.55;

  [x + w * 0.22, x + w * 0.78].forEach(spX => {
    ctx.fillStyle = THEME.cream;
    ctx.beginPath();
    ctx.arc(spX, spY, spR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = THEME.teal;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(spX, spY, spR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = THEME.gold;
    ctx.beginPath();
    ctx.arc(spX, spY, spR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = THEME.teal;
    ctx.beginPath();
    ctx.arc(spX, spY, spR * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Center cassette slot
  const slotW = w * 0.3;
  const slotH = h * 0.3;
  const slotX = x + w / 2 - slotW / 2;
  const slotY = y + h * 0.25;

  ctx.fillStyle = THEME.teal;
  ctx.fillRect(slotX, slotY, slotW, slotH);

  ctx.fillStyle = THEME.cream;
  ctx.fillRect(slotX + 6, slotY + 6, slotW - 12, slotH - 12);

  // Buttons
  const btnY = y + h * 0.82;
  const btnCount = 5;
  const btnW = w * 0.06;
  const btnGap = (w * 0.4) / (btnCount - 1);
  const btnsStartX = x + w / 2 - (w * 0.4) / 2;

  const btnColors = [THEME.coral, THEME.gold, THEME.cream, THEME.blue, THEME.coral];
  for (let i = 0; i < btnCount; i++) {
    ctx.fillStyle = btnColors[i];
    ctx.fillRect(btnsStartX + i * btnGap - btnW / 2, btnY, btnW, h * 0.08);
  }
}

function drawCassette(ctx, x, y, w, h) {
  // Body
  ctx.fillStyle = THEME.blue;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = THEME.teal;
  ctx.lineWidth = 4;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  // Top stripe
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(x + 10, y + 10, w - 20, h * 0.18);

  ctx.fillStyle = THEME.teal;
  ctx.font = `900 ${Math.floor(h * 0.12)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MIXTAPE  /  SIDE A', x + w / 2, y + 10 + h * 0.09);

  // Reels
  const reelR = h * 0.22;
  const reelY = y + h * 0.62;

  [x + w * 0.32, x + w * 0.68].forEach(reelX => {
    ctx.fillStyle = THEME.cream;
    ctx.beginPath();
    ctx.arc(reelX, reelY, reelR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = THEME.teal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(reelX, reelY, reelR, 0, Math.PI * 2);
    ctx.stroke();

    // Spokes
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 / 6) * i;
      ctx.beginPath();
      ctx.moveTo(reelX, reelY);
      ctx.lineTo(reelX + Math.cos(a) * reelR * 0.75, reelY + Math.sin(a) * reelR * 0.75);
      ctx.stroke();
    }

    ctx.fillStyle = THEME.teal;
    ctx.beginPath();
    ctx.arc(reelX, reelY, reelR * 0.15, 0, Math.PI * 2);
    ctx.fill();
  });

  // Window between reels
  ctx.fillStyle = THEME.cream;
  ctx.fillRect(x + w * 0.4, reelY - 4, w * 0.2, 8);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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