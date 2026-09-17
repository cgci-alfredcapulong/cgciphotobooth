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
let photos = [];

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

captureBtn.addEventListener('click', async () => {
  if (photos.length >= MAX_PHOTOS) return;
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

  if (photos.length < MAX_PHOTOS) {
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

        html, body {
          width: 4in;
          height: 6in;
          background: #ffffff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          color: #1a4d2e;
        }

        body {
          display: flex;
          flex-direction: column;
          padding: 0.15in;
          gap: 0.08in;
        }

        .header {
          background: #ffffff;
          border: 2px solid #1a4d2e;
          border-bottom: 4px solid #2d6a4f;
          border-radius: 8px;
          text-align: center;
          padding: 6px 8px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #1a4d2e;
        }

        .header .sub {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.5px;
          text-transform: none;
          color: #40916c;
          margin-top: 2px;
        }

        .row {
          width: 100%;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          display: block;
          border: 3px solid #1a4d2e;
          border-radius: 6px;
        }

        .footer {
          background: #ffffff;
          border-top: 2px solid #2d6a4f;
          text-align: center;
          font-size: 8px;
          letter-spacing: 0.5px;
          padding: 4px 0 2px;
          color: #2d6a4f;
          text-transform: uppercase;
        }

        @media print {
          html, body { width: 4in; height: 6in; }
          .row { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        Happy Teachers Day
        <div class="sub">Thank you for everything</div>
      </div>
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