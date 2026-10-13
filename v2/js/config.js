// ===== 設定値はここに集約（数字を変えたいときはこのファイルだけ触ればOK） =====
export const VERSION = '2.2';

export const CONFIG = {
  // OCR・AIに使うClaudeのモデル
  model: 'claude-sonnet-5-5',

  // OCRに送る画像の長辺（px）。大きいほど細かい字に強いが通信量が増える
  ocrMaxEdge: 1568,

  // QRコードを探す間隔（ミリ秒）
  qrIntervalMs: 300,
  // 同じQRを再表示するまでの待ち時間（ミリ秒）
  qrCooldownMs: 8000,

  // ピント判定のしきい値（数値が大きいほどシャープ）
  sharpGood: 120,
  sharpOk: 50,

  // 読み上げ速度の初期値
  defaultRate: 0.9,
};

// ===== ブラウザ内保存（localStorage）の小さなヘルパー =====
const PREFIX = 'aiStudyDesk_';
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : v; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, value); } catch { /* 保存できなくても動作は続ける */ }
  },
};
