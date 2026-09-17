const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const captureBtn = document.getElementById('captureBtn');
const printBtn = document.getElementById('printBtn');
const retakeBtn = document.getElementById('retakeBtn');
const results = document.getElementById('results');
const actions = document.getElementById('actions');
const countdown = document.getElementById('countdown');
const flash = document.getElementById('flash');

const MAX_PHOTOS = 3;
let stream = null;
let photos = []; // array of { blob, dataUrl, url }

// Start camera
startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = stream;
    captureBtn.disabled = false;
    startBtn.disabled = true;
  } catch (err) {
    alert('Camera access denied: ' + err.message);
  }
});

// Capture with countdown
captureBtn.addEventListener('click', async () => {
  if (photos.length >= MAX_PHOTOS) return;
  captureBtn.disabled = true;

  // 3-2-1 countdown
  for (let i = 3; i > 0; i--) {
    countdown.textContent = i;
    countdown.classList.add('active');
    await sleep(800);
  }
  countdown.classList.remove('active');

  // Flash + capture
  flash.classList.add('active');
  const dataUrl = captureFrame();
  flash.classList.remove('active');
  await sleep(150);

  photos.push(dataUrl);
  renderResults();

  // Upload to Supabase
  uploadPhoto(dataUrl).catch(e => console.error('Upload failed:', e));

  if (photos.length < MAX_PHOTOS) {
    captureBtn.disabled = false;
  } else {
    actions.style.display = 'flex';
  }
});

// Retake
retakeBtn.addEventListener('click', () => {
  photos = [];
  results.innerHTML = '';
  actions.style.display = 'none';
  captureBtn.disabled = false;
});

// Print
printBtn.addEventListener('click', () => {
  if (photos.length === 0) return;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(buildPrintHTML(photos));
  printWindow.document.close();
});

function captureFrame() {
  const canvas = document.createElement('canvas');
  const size = Math.min(video.videoWidth, video.videoHeight);
  canvas.width = 800;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');

  // Center crop to square
  const sx = (video.videoWidth - size) / 2;
  const sy = (video.videoHeight - size) / 2;
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 800, 800);

  return canvas.toDataURL('image/jpeg', 0.92);
}

function renderResults() {
  results.innerHTML = photos.map(src => `<img src="${src}" />`).join('');
}

async function uploadPhoto(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const filename = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const { error: uploadError } = await db.storage
    .from('photobooth')
    .upload(filename, blob, { contentType: 'image/jpeg' });

  if (uploadError) throw uploadError;

  const { data: urlData } = db.storage.from('photobooth').getPublicUrl(filename);

  await db.from('photos').insert({ image_url: urlData.publicUrl });
}

function buildPrintHTML(imgs) {
  const rows = imgs.map(src => `<img src="${src}" class="row" />`).join('');
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print</title>
      <style>
        @page { size: 4in 6in; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 4in;
          padding: 0.15in;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 0.1in;
          font-family: sans-serif;
        }
        .header {
          text-align: center;
          padding: 6px 0;
          font-size: 14px;
          font-weight: bold;
          color: #764ba2;
        }
        .row {
          width: 100%;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          display: block;
          border-radius: 4px;
        }
        .footer {
          text-align: center;
          font-size: 10px;
          color: #888;
          padding: 4px 0;
        }
        @media print {
          body { width: 4in; }
        }
      </style>
    </head>
    <body>
      <div class="header">💖 Happy Teachers Day 💖</div>
      ${rows}
      <div class="footer">${new Date().toLocaleDateString()}</div>
      <script>
        window.onload = () => {
          setTimeout(() => { window.print(); }, 400);
        };
      <\/script>
    </body>
    </html>
  `;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }