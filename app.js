const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const captureBtn = document.getElementById('captureBtn');
const printBtn = document.getElementById('printBtn');
const retakeBtn = document.getElementById('retakeBtn');
const flipBtn = document.getElementById('flipBtn');
const results = document.getElementById('results');
const actions = document.getElementById('actions');
const countdown = document.getElementById('countdown');
const flash = document.getElementById('flash');

const MAX_PHOTOS = 3;
let stream = null;
let photos = [];
let facingMode = 'user';

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

  if (facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

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

/* ------------------------------------------------------------------
   PRINT LAYOUT - 90's THEME
   A4 landscape (297mm x 210mm). Strip ~72mm wide, aligned right.
   ------------------------------------------------------------------ */

const STRIP_ALIGN = 'right'; // 'right' | 'left' | 'center'

function buildPrintHTML(imgs) {
  const photoCells = imgs.map((src, i) => `
    <div class="photo-frame">
      <img src="${src}" class="photo" />
      <span class="photo-num">${String(i + 1).padStart(2, '0')}</span>
    </div>
  `).join('');

  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const justify =
    STRIP_ALIGN === 'right' ? 'flex-end' :
    STRIP_ALIGN === 'left'  ? 'flex-start' :
    'center';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 297mm;
          height: 210mm;
          background: #ffffff;
          font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
          color: #1a4d2e;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          overflow: hidden;
        }

        .page {
          width: 297mm;
          height: 210mm;
          display: flex;
          align-items: center;
          justify-content: ${justify};
          padding: 8mm;
          background: #ffffff;
        }

        /* ---------- STRIP ---------- */
        .strip {
          width: 72mm;
          height: 194mm;
          padding: 4mm;
          background: #ffffff;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 2.5mm;
        }

        /* Chunky 90's double border */
        .strip::before {
          content: "";
          position: absolute;
          inset: 0;
          border: 1.4mm solid #1a4d2e;
          pointer-events: none;
        }

        .strip::after {
          content: "";
          position: absolute;
          inset: 2.2mm;
          border: 0.35mm solid #2d6a4f;
          pointer-events: none;
        }

        /* Diagonal accent blocks in corners - very 90's */
        .corner-accent {
          position: absolute;
          width: 8mm;
          height: 8mm;
          background: #1a4d2e;
          z-index: 2;
        }
        .corner-accent.tl {
          top: 0; left: 0;
          clip-path: polygon(0 0, 100% 0, 0 100%);
        }
        .corner-accent.tr {
          top: 0; right: 0;
          clip-path: polygon(0 0, 100% 0, 100% 100%);
        }
        .corner-accent.bl {
          bottom: 0; left: 0;
          clip-path: polygon(0 0, 0 100%, 100% 100%);
        }
        .corner-accent.br {
          bottom: 0; right: 0;
          clip-path: polygon(100% 0, 100% 100%, 0 100%);
        }

        .inner {
          position: relative;
          z-index: 3;
          display: flex;
          flex-direction: column;
          gap: 2.5mm;
          height: 100%;
          padding: 3mm 2mm 2mm;
        }

        /* ---------- HEADER ---------- */
        .header {
          text-align: center;
          padding: 2.5mm 0 2.5mm;
          background: #1a4d2e;
          color: #ffffff;
          position: relative;
          border-radius: 0;
          box-shadow: 1.6mm 1.6mm 0 #2d6a4f;
        }

        /* Zig-zag underline strip - retro */
        .header::after {
          content: "";
          position: absolute;
          left: 0; right: 0; bottom: -1.6mm;
          height: 1.6mm;
          background:
            linear-gradient(135deg, transparent 50%, #1a4d2e 50%) 0 0 / 3.2mm 3.2mm,
            linear-gradient(-135deg, transparent 50%, #1a4d2e 50%) 0 0 / 3.2mm 3.2mm;
          background-repeat: repeat-x;
        }

        .eyebrow {
          font-size: 5.5pt;
          letter-spacing: 1mm;
          color: #d4e8db;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 1mm;
          padding-left: 1mm;
        }

        .title {
          font-size: 13pt;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 0.4mm;
          text-transform: uppercase;
          line-height: 1.05;
          font-family: 'Trebuchet MS', sans-serif;
          text-shadow: 0.5mm 0.5mm 0 #2d6a4f;
        }

        .sub-title {
          font-size: 5pt;
          letter-spacing: 0.6mm;
          color: #d4e8db;
          text-transform: uppercase;
          margin-top: 1.2mm;
          font-weight: 600;
        }

        /* ---------- PHOTOS ---------- */
        .photo-frame {
          position: relative;
          flex: 1;
          min-height: 0;
          border: 1mm solid #1a4d2e;
          padding: 0.8mm;
          background: #ffffff;
          box-shadow: 1.4mm 1.4mm 0 #d4e8db;
        }

        .photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .photo-num {
          position: absolute;
          top: -1.8mm;
          left: 2.5mm;
          background: #1a4d2e;
          color: #ffffff;
          font-size: 5pt;
          font-weight: 900;
          letter-spacing: 0.5mm;
          padding: 0.7mm 1.8mm 0.6mm;
          border: 0.3mm solid #ffffff;
          line-height: 1;
          font-family: 'Courier New', monospace;
        }

        /* ---------- FOOTER ---------- */
        .footer {
          text-align: center;
          padding: 2.5mm 0 1.5mm;
          background: #1a4d2e;
          color: #ffffff;
          position: relative;
        }

        /* Zig-zag top border */
        .footer::before {
          content: "";
          position: absolute;
          left: 0; right: 0; top: -1.6mm;
          height: 1.6mm;
          background:
            linear-gradient(135deg, transparent 50%, #1a4d2e 50%) 0 0 / 3.2mm 3.2mm,
            linear-gradient(-135deg, transparent 50%, #1a4d2e 50%) 0 0 / 3.2mm 3.2mm;
          background-repeat: repeat-x;
        }

        .footer .stamp {
          display: inline-block;
          font-family: 'Courier New', monospace;
          font-size: 5pt;
          letter-spacing: 0.6mm;
          color: #ffffff;
          border: 0.3mm dashed #d4e8db;
          padding: 0.6mm 2mm;
          margin-bottom: 1.2mm;
          text-transform: uppercase;
        }

        .footer .message {
          font-size: 6pt;
          letter-spacing: 0.6mm;
          color: #ffffff;
          text-transform: uppercase;
          font-weight: 900;
          margin-bottom: 0.8mm;
        }

        .footer .date {
          font-size: 4.5pt;
          letter-spacing: 0.5mm;
          color: #d4e8db;
          text-transform: uppercase;
          font-family: 'Courier New', monospace;
        }

        @media print {
          html, body { width: 297mm; height: 210mm; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="strip">
          <div class="corner-accent tl"></div>
          <div class="corner-accent tr"></div>
          <div class="corner-accent bl"></div>
          <div class="corner-accent br"></div>

          <div class="inner">
            <div class="header">
              <div class="eyebrow">With Gratitude</div>
              <div class="title">Happy<br/>Teachers Day</div>
              <div class="sub-title">Thank You For Everything</div>
            </div>

            ${photoCells}

            <div class="footer">
              <div class="stamp">No. ${new Date().getFullYear()}</div>
              <div class="message">Class of ${new Date().getFullYear()}</div>
              <div class="date">${today}</div>
            </div>
          </div>
        </div>
      </div>
      <script>
        window.onload = () => {
          setTimeout(() => { window.print(); }, 500);
        };
      <\/script>
    </body>
    </html>
  `;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }