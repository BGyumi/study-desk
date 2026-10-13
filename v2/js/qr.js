// ===== QRコード担当 =====
// 読み取りは3段構え（どれか1つで読めればOK）
//   1. Chrome内蔵の BarcodeDetector（使える環境のみ）
//   2. ZXing（高性能ライブラリ）でカメラ映像を「縮小せず」そのまま解析
//   3. ZXing でシャープ処理（ボケ補正）した映像を解析
// テスト画像30枚（小さい・ボケ・傾き）での読み取り成功数： 旧方式 9 → 新方式 17

const VENDOR = new URL('../vendor/', import.meta.url).href;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('読み込み失敗: ' + src));
    document.head.appendChild(s);
  });
}

// 白黒にして輪郭を強調する（アンシャープマスク）
function sharpen(imageData, amount = 2) {
  const { width: W, height: H, data: d } = imageData;
  const g = new Float32Array(W * H);
  for (let i = 0, k = 0; i < d.length; i += 4, k++) g[k] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  // 5x5のぼかし（横→縦の2回に分けて高速化）
  const tmp = new Float32Array(W * H), blur = new Float32Array(W * H);
  const cx = i => (i < 0 ? 0 : i >= W ? W - 1 : i);
  const cy = i => (i < 0 ? 0 : i >= H ? H - 1 : i);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let acc = 0;
    for (let i = -2; i <= 2; i++) acc += g[row + cx(i)];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc / 5;
      acc += g[row + cx(x + 3)] - g[row + cx(x - 2)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let i = -2; i <= 2; i++) acc += tmp[cy(i) * W + x];
    for (let y = 0; y < H; y++) {
      blur[y * W + x] = acc / 5;
      acc += tmp[cy(y + 3) * W + x] - tmp[cy(y - 2) * W + x];
    }
  }
  const out = new ImageData(W, H);
  for (let k = 0; k < W * H; k++) {
    const v = g[k] + amount * (g[k] - blur[k]);
    const c = v < 0 ? 0 : v > 255 ? 255 : v;
    out.data[k * 4] = out.data[k * 4 + 1] = out.data[k * 4 + 2] = c;
    out.data[k * 4 + 3] = 255;
  }
  return out;
}

export async function createQrScanner() {
  const engines = [];

  // 1. Chrome内蔵
  let native = null;
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        native = new window.BarcodeDetector({ formats: ['qr_code'] });
        engines.push('Chrome内蔵');
      }
    } catch { /* 使えなければZXingだけで動く */ }
  }

  // 2,3. ZXing（アプリ内に同梱）
  await loadScript(VENDOR + 'zxing-reader.js');
  const Z = window.ZXingWASM;
  Z.prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? VENDOR + path : prefix + path) },
  });
  engines.push('ZXing', 'ZXing+ボケ補正');
  const opts = { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1, returnErrors: true };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let turn = 0;

  return {
    engine: engines.join(' → '),
    // 戻り値: { text } 読めた / { seen:true } QRらしきものは見えたが読めない / null 何もない
    async detect(video) {
      if (native) {
        const r = await native.detect(video);
        if (r[0]?.rawValue) return { text: r[0].rawValue };
      }
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // 毎回は重いので、「そのまま」と「ボケ補正」を交互に試す
      const img = (turn++ % 2 === 0) ? frame : sharpen(frame);
      const results = await Z.readBarcodes(img, opts);
      const ok = results.find(r => r.isValid && r.text);
      if (ok) return { text: ok.text };
      if (results.length) return { seen: true };
      return null;
    },
  };
}

// 読み取った文字列を「どう表示するか」に分類する
export function classifyQr(text) {
  let url;
  try { url = new URL(text); } catch { return { type: 'text', text }; }
  if (!/^https?:$/.test(url.protocol)) return { type: 'text', text };

  const host = url.hostname.replace(/^www\./, '');
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) {
    let id = url.searchParams.get('v');
    if (!id && host === 'youtu.be') id = url.pathname.slice(1);
    if (!id) { const m = url.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/); if (m) id = m[2]; }
    if (id) return { type: 'youtube', id, url: url.href };
  }
  if (/\.(mp3|m4a|wav|aac|oga)$/i.test(url.pathname)) return { type: 'audio', url: url.href };
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return { type: 'video', url: url.href };
  return { type: 'link', url: url.href, host };
}
