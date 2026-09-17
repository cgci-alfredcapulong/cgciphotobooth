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
let facingMode = 'user'; // 'user' = front, 'environment' = back

startBtn.addEventListener('click', async () => {
  await startCamera();
});

flipBtn.addEventListener('click', async () => {
  if (!stream) return;
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  await startCamera();
});

async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

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

    // Mirror only the front camera preview
    if (facingMode === 'user') {
      video.classList.add('mirrored');
    } else {
      video.classList.remove('mirrored');
    }

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

  // Mirror the captured image only for front camera
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

function buildPrintHTML(imgs) {
  const rows = imgs.map((src, i) => `
    <div class="photo-frame">
      <img src="${src}" class="photo" />
      <span class="photo-num">${String(i + 1).padStart(2, '0')}</span>
    </div>
  `).join('');

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
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .card {
          width: 4in;
          height: 6in;
          padding: 0.14in;
          display: flex;
          flex-direction: column;
          gap: 0.07in;
          position: relative;
          background:
            radial-gradient(circle at 0% 0%, rgba(45,106,79,0.08) 0%, transparent 35%),
            radial-gradient(circle at 100% 100%, rgba(45,106,79,0.08) 0%, transparent 35%),
            #ffffff;
        }

        /* Outer ornamental border */
        .card::before {
          content: "";
          position: absolute;
          inset: 0.06in;
          border: 1.5px solid #1a4d2e;
          border-radius: 6px;
          pointer-events: none;
        }

        .card::after {
          content: "";
          position: absolute;
          inset: 0.085in;
          border: 0.5px solid #2d6a4f;
          border-radius: 5px;
          pointer-events: none;
          opacity: 0.55;
        }

        .inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 0.07in;
          height: 100%;
          padding: 0.04in 0.05in;
        }

        /* Header */
        .header {
          text-align: center;
          padding: 6px 4px 7px;
          border-bottom: 1px solid #2d6a4f;
          position: relative;
        }

        .header::before,
        .header::after {
          content: "";
          position: absolute;
          bottom: -3px;
          width: 6px;
          height: 6px;
          background: #1a4d2e;
          transform: rotate(45deg);
        }
        .header::before { left: 8px; }
        .header::after { right: 8px; }

        .eyebrow {
          font-size: 7px;
          letter-spacing: 3px;
          color: #40916c;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .title {
          font-size: 15px;
          font-weight: 800;
          color: #1a4d2e;
          letter-spacing: 2px;
          text-transform: uppercase;
          line-height: 1.1;
        }

        .divider {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin-top: 3px;
        }

        .divider .line {
          width: 22px;
          height: 1px;
          background: #2d6a4f;
        }

        .divider .dot {
          width: 4px;
          height: 4px;
          background: #1a4d2e;
          transform: rotate(45deg);
        }

        /* Photo frames */
        .photo-frame {
          position: relative;
          flex: 1;
          min-height: 0;
          border: 2.5px solid #1a4d2e;
          border-radius: 4px;
          padding: 3px;
          background: #ffffff;
          box-shadow: inset 0 0 0 1px #ffffff, 0 0 0 1px #2d6a4f;
        }

        .photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 2px;
        }

        .photo-num {
          position: absolute;
          bottom: -7px;
          right: 6px;
          background: #1a4d2e;
          color: #ffffff;
          font-size: 6px;
          font-weight: 700;
          letter-spacing: 1px;
          padding: 1.5px 5px;
          border-radius: 8px;
          border: 1px solid #ffffff;
          line-height: 1;
        }

        /* Footer */
        .footer {
          text-align: center;
          padding-top: 4px;
          border-top: 1px solid #2d6a4f;
          display: flex;
          flex-direction: column;
          gap: 2px;
          align-items: center;
        }

        .footer .message {
          font-size: 7.5px;
          letter-spacing: 1.5px;
          color: #1a4d2e;
          text-transform: uppercase;
          font-weight: 700;
        }

        .footer .date {
          font-size: 6.5px;
          letter-spacing: 1px;
          color: #40916c;
          text-transform: uppercase;
        }

        .footer .leaves {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .footer .leaves::before,
        .footer .leaves::after {
          content: "";
          width: 18px;
          height: 1px;
          background: #2d6a4f;
        }

        .footer .leaf {
          width: 5px;
          height: 5px;
          border: 1px solid #1a4d2e;
          transform: rotate(45deg);
        }

        @media print {
          html, body { width: 4in; height: 6in; }
          .card { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="card">
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

          ${rows}

          <div class="footer">
            <div class="leaves"><span class="leaf"></span></div>
            <div class="message">Thank You For Everything</div>
            <div class="date">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
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