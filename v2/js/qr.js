// ===== QRコード担当 =====
// 1. Chrome内蔵の BarcodeDetector（速くて正確）を優先
// 2. 使えない環境では jsQR を「縮小した全体」と「中央の切り抜き」の2段で探す

// ネットが不安定でも動くよう、アプリ内に同梱したものを使う
const JSQR_URL = new URL('../vendor/jsQR.js', import.meta.url).href;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('読み込み失敗: ' + src));
    document.head.appendChild(s);
  });
}

export async function createQrScanner() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return {
          engine: 'Chrome内蔵 (BarcodeDetector)',
          async detect(video) {
            const found = await detector.detect(video);
            return found[0]?.rawValue || null;
          },
        };
      }
    } catch { /* 下のjsQRへ */ }
  }

  await loadScript(JSQR_URL);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });

  function tryRegion(video, sx, sy, sw, sh, maxW) {
    const scale = Math.min(1, maxW / sw);
    c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    return window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  }

  return {
    engine: 'jsQR（予備）',
    async detect(video) {
      const vw = video.videoWidth, vh = video.videoHeight;
      // 全体を縮小して探す → 見つからなければ中央を等倍で探す（小さいQR対策）
      const a = tryRegion(video, 0, 0, vw, vh, 960);
      if (a?.data) return a.data;
      const b = tryRegion(video, vw * 0.25, vh * 0.25, vw * 0.5, vh * 0.5, 960);
      return b?.data || null;
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
