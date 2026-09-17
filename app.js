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
   PRINT LAYOUT
   Bond paper A4 landscape: 297mm x 210mm (11.69in x 8.27in)
   Strip occupies ~1/4 of page width, positioned on the right.
   Set STRIP_ALIGN to 'right', 'left', or 'center' below.
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
        /* A4 landscape */
        @page { size: A4 landscape; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 297mm;
          height: 210mm;
          background: #ffffff;
          font-family: 'Segoe UI', system-ui, sans-serif;
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
          padding: 5mm 5mm 4mm;
          background:
            radial-gradient(circle at 0% 0%, rgba(45,106,79,0.10) 0%, transparent 30%),
            radial-gradient(circle at 100% 100%, rgba(45,106,79,0.10) 0%, transparent 30%),
            #ffffff;
          border-radius: 3mm;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 3mm;
          box-shadow: 0 0 0 0.5px rgba(26,77,46,0.25);
        }

        /* Double ornamental border */
        .strip::before {
          content: "";
          position: absolute;
          inset: 1.2mm;
          border: 0.7mm solid #1a4d2e;
          border-radius: 2.4mm;
          pointer-events: none;
        }

        .strip::after {
          content: "";
          position: absolute;
          inset: 2.2mm;
          border: 0.25mm solid #2d6a4f;
          border-radius: 2mm;
          pointer-events: none;
          opacity: 0.55;
        }

        .inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 3mm;
          height: 100%;
          padding: 1.5mm 1mm 0.5mm;
        }

        /* ---------- HEADER ---------- */
        .header {
          text-align: center;
          padding: 2mm 0 2.5mm;
          position: relative;
          border-bottom: 0.3mm solid #2d6a4f;
        }

        .header::before,
        .header::after {
          content: "";
          position: absolute;
          bottom: -1.1mm;
          width: 1.8mm;
          height: 1.8mm;
          background: #1a4d2e;
          transform: rotate(45deg);
        }
        .header::before { left: 3mm; }
        .header::after  { right: 3mm; }

        .eyebrow {
          font-size: 5.5pt;
          letter-spacing: 1.2mm;
          color: #40916c;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 1mm;
          padding-left: 1.2mm;
        }

        .title {
          font-size: 12pt;
          font-weight: 800;
          color: #1a4d2e;
          letter-spacing: 0.6mm;
          text-transform: uppercase;
          line-height: 1.05;
          padding-left: 0.6mm;
        }

        .divider {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.4mm;
          margin-top: 1.2mm;
        }

        .divider .line {
          width: 8mm;
          height: 0.25mm;
          background: #2d6a4f;
        }

        .divider .dot {
          width: 1.3mm;
          height: 1.3mm;
          background: #1a4d2e;
          transform: rotate(45deg);
        }

        /* ---------- PHOTOS ---------- */
        .photo-frame {
          position: relative;
          flex: 1;
          min-height: 0;
          border: 0.7mm solid #1a4d2e;
          border-radius: 1.6mm;
          padding: 0.7mm;
          background: #ffffff;
          box-shadow: inset 0 0 0 0.25mm #ffffff, 0 0 0 0.25mm #2d6a4f;
        }

        .photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 0.9mm;
        }

        .photo-num {
          position: absolute;
          bottom: -1.6mm;
          right: 2.5mm;
          background: #1a4d2e;
          color: #ffffff;
          font-size: 4.5pt;
          font-weight: 700;
          letter-spacing: 0.5mm;
          padding: 0.6mm 1.6mm 0.5mm;
          border-radius: 1.8mm;
          border: 0.25mm solid #ffffff;
          line-height: 1;
        }

        /* ---------- FOOTER ---------- */
        .footer {
          text-align: center;
          padding-top: 2mm;
          border-top: 0.3mm solid #2d6a4f;
          display: flex;
          flex-direction: column;
          gap: 0.8mm;
          align-items: center;
        }

        .footer .ornament {
          display: flex;
          align-items: center;
          gap: 1.2mm;
        }

        .footer .ornament::before,
        .footer .ornament::after {
          content: "";
          width: 6mm;
          height: 0.25mm;
          background: #2d6a4f;
        }

        .footer .leaf {
          width: 1.4mm;
          height: 1.4mm;
          border: 0.25mm solid #1a4d2e;
          transform: rotate(45deg);
        }

        .footer .message {
          font-size: 5.5pt;
          letter-spacing: 0.5mm;
          color: #1a4d2e;
          text-transform: uppercase;
          font-weight: 700;
        }

        .footer .date {
          font-size: 5pt;
          letter-spacing: 0.4mm;
          color: #40916c;
          text-transform: uppercase;
        }

        @media print {
          html, body { width: 297mm; height: 210mm; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="strip">
          <div class="inner">
            <div class="header">
              <div class="eyebrow">With Gratitude</div>
              <div class="title">Happy Teachers Day</div>
              <div class="divider">
                <span class="line"></span>
                <span class="dot"></span>
                <span class="line"></span>
              </div>
            </div>

            ${photoCells}

            <div class="footer">
              <div class="ornament"><span class="leaf"></span></div>
              <div class="message">Teacher, Ikaw naman.</div>
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