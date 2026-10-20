// ===== 設定値はここに集約（数字を変えたいときはこのファイルだけ触ればOK） =====
export const VERSION = '3.2';

export const CONFIG = {
  // スキャナー判定：1文字ごとの間隔がこれ以下なら「スキャナーの入力」とみなす（ミリ秒）
  scanMaxGapMs: 40,
  // これより短い文字列はスキャンとみなさない（人がEnterを押しただけ、などを無視）
  scanMinLength: 4,
  // Enterが来なくても、入力が止まってからこの時間でスキャン完了とみなす（ミリ秒）
  scanIdleCommitMs: 120,

  // 同じQRを続けて読んだとき、無視する時間（ミリ秒）
  sameScanCooldownMs: 3000,

  // 許可サイトの機能：false＝いったんOFF（どのサイトのQRでも開く）。おやモードのスイッチでいつでも戻せる
  allowListOn: false,

  // 最初から許可しておくサイト（おやモードで追加・削除できる）
  defaultAllow: ['youtube.com', 'youtu.be', 'studysapuri.jp', 'littlefox.com'],
};

// ===== ブラウザ内保存（localStorage）の小さなヘルパー =====
const PREFIX = 'aiStudyDesk3_';
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 保存できなくても動作は続ける */ }
  },
};
