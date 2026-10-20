// ===== アプリ本体：スキャナー → 振り分け → 表示 をつなぐ =====
import { CONFIG, VERSION } from './config.js?v=3.0';
import { startScanner } from './scanner.js?v=3.0';
import { route, classify } from './router.js?v=3.0';
import { allow, pending } from './allow.js?v=3.0';
import { showMedia, openPopup, closeMedia } from './media.js?v=3.0';

const $ = id => document.getElementById(id);
const el = {
  brand: $('brand'), ver: $('ver'), dot: $('scannerDot'),
  status: $('status'), media: $('media'), mediaLabel: $('mediaLabel'),
  back: $('backToChild'), pendingList: $('pendingList'), allowList: $('allowList'),
  allowForm: $('allowForm'), allowInput: $('allowInput'),
  scanLog: $('scanLog'), testForm: $('testForm'), testInput: $('testInput'),
};
el.ver.textContent = 'v' + VERSION;

const isParent = () => !document.body.classList.contains('child-mode');
const log = [];               // スキャン履歴（おやモードの確認用・最新10件）
let lastScan = { text: '', at: 0 };
let current = null;           // いま開いているもの

/* ================= こどもモードの画面（状態ごと） ================= */
const SCANNER_SVG = `<svg class="scanner-pic" viewBox="0 0 200 120"><path d="M100 26 L40 -10 L160 -10Z" fill="#E07A4F" opacity=".18"/>
  <rect x="62" y="26" width="76" height="92" rx="22" fill="#2B2A33"/><rect x="76" y="40" width="48" height="26" rx="6" fill="#4A4955"/>
  <circle cx="100" cy="92" r="11" fill="#E07A4F"/></svg>`;

const screens = {
  idle: () => `
    ${SCANNER_SVG}
    <div class="big-msg">教材の QR を<br><em>ピッ</em> してね</div>
    <div class="sub">スキャナーを QR に あてるだけ</div>`,

  panel: r => `
    <div class="pill ok">ピッ しました ✓</div>
    <div class="sub">${r.kind === 'youtube' ? 'YouTube の どうが' : r.kind === 'audio' ? 'おんせい' : 'どうが'}</div>
    <div class="title">${esc(r.host)}</div>
    <div class="sub">本を 見ながら きいてね</div>
    <div class="btn-row"><button class="btn ghost big" data-act="close">とじる</button></div>`,

  popup: r => `
    <div class="pill ok">ピッ しました ✓</div>
    <div class="big-msg" style="font-size:40px">みぎの まどで<br>ひらいたよ</div>
    <div class="title" style="font-size:22px">${esc(r.host)}</div>
    <div class="btn-row">
      <button class="btn orange big" data-act="reopen">もういちど ひらく</button>
      <button class="btn ghost big" data-act="close">とじる</button>
    </div>`,

  blockedPopup: r => `
    <div class="pill wait">ひらけなかったよ</div>
    <div class="big-msg" style="font-size:40px">ボタンを おして<br>ひらいてね</div>
    <div class="title" style="font-size:22px">${esc(r.host)}</div>
    <div class="btn-row"><button class="btn orange big" data-act="reopen">▶ ひらく</button></div>`,

  notAllowed: r => `
    <div class="pill wait">まだ ひらけない QR</div>
    <div class="big-msg" style="font-size:44px">おうちの人に<br>きいてね</div>
    <div class="sub">${esc(r.host)}</div>
    <div class="btn-row"><button class="btn ghost big" data-act="close">もどる</button></div>`,

  later: msg => `
    <div class="pill wait">ピッ できたよ</div>
    <div class="big-msg" style="font-size:40px">${msg}</div>
    <div class="sub">これから つかえるように なるよ</div>
    <div class="btn-row"><button class="btn ghost big" data-act="close">もどる</button></div>`,

  unknown: () => `
    <div class="pill wait">？</div>
    <div class="big-msg" style="font-size:40px">これは 教材の<br>QR じゃないみたい</div>
    <div class="btn-row"><button class="btn ghost big" data-act="close">もどる</button></div>`,
};

function render(name, arg) {
  el.status.innerHTML = screens[name](arg);
}

el.status.addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') goIdle();
  if (act === 'reopen' && current) render(openPopup(current.url) ? 'popup' : 'blockedPopup', current);
});

function goIdle() {
  closeMedia(el.media);
  current = null;
  el.media.innerHTML = `<div class="placeholder">ここに どうがや おんせいが でるよ</div>`;
  render('idle');
}

/* ================= スキャンを受け取ったとき ================= */
function handleScan(scan) {
  const r = route(scan);

  // 同じものを続けて読んだら無視（ピッピッと2回鳴らしてしまった時など）
  const now = Date.now();
  if (r.text === lastScan.text && now - lastScan.at < CONFIG.sameScanCooldownMs) return;
  lastScan = { text: r.text, at: now };

  addLog(scan, r);
  el.dot.textContent = '● ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + ' に読んだ';
  el.dot.classList.add('on');

  if (isParent()) return;      // おやモード中は「確認」だけ（開かない）

  if (r.type === 'url') {
    if (!allow.isAllowed(r.host)) {
      pending.push({ url: r.url, host: r.host });
      beep(false);
      closeMedia(el.media);      // 前に開いていた動画などは止める
      current = null;
      el.media.innerHTML = `<div class="placeholder">ここに どうがや おんせいが でるよ</div>`;
      return render('notAllowed', r);
    }
    beep(true); flash();
    closeMedia(el.media);
    current = r;
    const { opened } = showMedia(el.media, r);
    if (opened === 'panel') return render('panel', r);
    el.media.innerHTML = `<div class="placeholder">みぎの まどに ひょうじ中</div>`;
    return render(opened === 'popup' ? 'popup' : 'blockedPopup', r);
  }

  beep(true); flash();
  if (r.type === 'card') return render('later', 'カードを<br>よみとったよ');
  if (r.type === 'isbn') return render('later', '本の バーコードを<br>よみとったよ');
  beep(false);
  render('unknown');
}

startScanner(handleScan);

/* ================= おやモード ================= */
let pressTimer = null;
el.brand.addEventListener('pointerdown', () => {
  el.brand.classList.add('pressing');
  pressTimer = setTimeout(() => setParent(true), 1500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.brand.addEventListener(t, () => {
  el.brand.classList.remove('pressing'); clearTimeout(pressTimer);
}));
el.back.onclick = () => setParent(false);

function setParent(on) {
  el.brand.classList.remove('pressing');
  document.body.classList.toggle('child-mode', !on);
  if (on) { closeMedia(el.media); refreshParent(); }
  else goIdle();
}

function refreshParent() {
  const p = pending.list();
  el.pendingList.innerHTML = p.length ? p.map(x => `
    <li><div><b>${esc(x.host)}</b><div class="meta">${esc(x.url)}</div></div>
      <div class="btns"><button class="btn" data-ok="${esc(x.host)}">許可</button>
      <button class="btn ghost" data-ng="${esc(x.url)}">開かない</button></div></li>`).join('')
    : `<li class="empty">ありません</li>`;

  el.allowList.innerHTML = allow.list().map(d => `
    <li><b>${esc(d)}</b><div class="btns"><button class="btn ghost" data-del="${esc(d)}">削除</button></div></li>`).join('')
    || `<li class="empty">ありません</li>`;

  el.scanLog.innerHTML = log.length ? log.map(l => `
    <tr><td>${l.time}</td><td class="${l.diff ? 'diff' : ''}">${esc(l.raw)}</td><td>${esc(l.us)}</td><td><span class="tag">${l.label}</span></td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">まだ読んでいません</td></tr>`;
}

el.pendingList.addEventListener('click', e => {
  const ok = e.target.dataset.ok, ng = e.target.dataset.ng;
  if (ok) allow.add(ok);
  if (ng) pending.removeUrl(ng);
  refreshParent();
});
el.allowList.addEventListener('click', e => {
  const d = e.target.dataset.del;
  if (d && confirm(`${d} を許可サイトから外しますか？`)) { allow.remove(d); refreshParent(); }
});
el.allowForm.onsubmit = e => {
  e.preventDefault();
  if (!allow.add(el.allowInput.value)) return alert('サイトの形になっていません（例：example.com）');
  el.allowInput.value = '';
  refreshParent();
};

// スキャナーが無くても、URLを貼りつけて「読んだこと」にできる（こどもモードに戻って実行）
el.testForm.onsubmit = e => {
  e.preventDefault();
  const text = el.testInput.value.trim();
  if (!text) return;
  setParent(false);
  lastScan = { text: '', at: 0 };
  handleScan({ raw: text, usText: text, at: new Date() });
};

const LABEL = { url: 'URL', card: 'カード', isbn: '本(ISBN)', other: 'その他' };
function addLog(scan, r) {
  const ok = r.type === 'url' ? (allow.isAllowed(r.host) ? '・許可' : '・未許可') : '';
  log.unshift({
    time: scan.at.toLocaleTimeString('ja-JP'),
    raw: scan.raw, us: scan.usText, diff: scan.raw !== scan.usText,
    label: LABEL[r.type] + ok,
  });
  log.length = Math.min(log.length, 10);
  if (isParent()) refreshParent();
}

/* ================= 小さな演出 ================= */
function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 800);
}

let audioCtx = null;
function beep(good) {
  try {
    audioCtx ||= new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    o.frequency.setValueAtTime(good ? 880 : 330, t);
    if (good) o.frequency.setValueAtTime(1320, t + 0.09);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.26);
  } catch { /* 音が出なくても動作は続ける */ }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 開発中の確認用（コンソールから classify('https://...') を試せる）
window.studyDesk = { classify, allow, pending };

goIdle();
