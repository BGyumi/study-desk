// ===== アプリ本体：スキャナー → 振り分け → 表示 をつなぐ =====
import { CONFIG, VERSION } from './config.js?v=4.2';
import { startScanner } from './scanner.js?v=4.2';
import { route, classify } from './router.js?v=4.2';
import { allow, pending } from './allow.js?v=4.2';
import { showMedia, openTab, closeMedia, tabClosed } from './media.js?v=4.2';
import { history, siteName, whenLabel, youtubeTitle, pageHint } from './history.js?v=4.2';

const $ = id => document.getElementById(id);
const el = {
  ver: $('ver'), fox: $('fox'), title: $('title'), sub: $('sub'), act: $('act'),
  ready: $('ready'), readyText: $('readyText'),
  histBtn: $('histBtn'), brand: $('brand'), hist: $('hist'), histList: $('histList'),
  mediaDrop: $('mediaDrop'), media: $('media'),
  back: $('backToChild'), pendingList: $('pendingList'), allowList: $('allowList'),
  allowForm: $('allowForm'), openAll: $('openAll'), allowInput: $('allowInput'),
  scanLog: $('scanLog'), testForm: $('testForm'), testInput: $('testInput'),
};
el.ver.textContent = 'v' + VERSION;

const FOX = { sleep: 'img/fox-sleep.png', awake: 'img/fox-awake.png' };
const isParent = () => !document.body.classList.contains('child-mode');
const log = [];               // スキャン履歴（おやモードの確認用・最新10件）
let lastScan = { text: '', at: 0 };
let current = null;           // いま開いているもの

/* ================= こどもモード：バーの表示 ================= */
// fox: 'sleep' | 'awake'、act: ボタン文字（ポップアップが止められた時だけ）
function show({ fox = 'awake', title, sub = '', act = '' }) {
  if (!el.fox.src.endsWith(FOX[fox])) el.fox.src = FOX[fox];
  if (fox === 'awake') { el.fox.classList.remove('pop'); void el.fox.offsetWidth; el.fox.classList.add('pop'); }
  el.title.textContent = title;
  el.sub.textContent = sub;
  el.act.hidden = !act;
  el.act.textContent = act;
}

const itemLabel = r => [siteName(r.host), r.title || (r.kind === 'page' ? pageHint(r.url) : '')].filter(Boolean).join(' | ');

function goIdle() {
  closeMedia(el.media);
  current = null;
  el.mediaDrop.hidden = true;
  show({ fox: 'sleep', title: 'ピッとすると、ひらくよ', sub: 'QRコードを読み取ってください' });
}

el.act.onclick = () => {
  if (current && openTab(current.url)) show({ title: '教材をひらきました', sub: itemLabel(current) });
};

/* ================= 教材を開く（スキャンでも履歴からでも同じ） ================= */
function openItem(r) {
  closeMedia(el.media);
  el.hist.hidden = true; el.histBtn.classList.remove('on');
  current = r;

  const { opened } = showMedia(el.media, r);
  el.mediaDrop.hidden = opened !== 'panel';
  if (opened === 'blocked') show({ title: 'ボタンで ひらいてね', sub: itemLabel(r), act: '▶ ひらく' });
  else show({ title: '教材をひらきました', sub: itemLabel(r) });

  history.add({ url: r.url, host: r.host, kind: r.kind, youtubeId: r.youtubeId, title: r.title });
  if (r.kind === 'youtube' && !r.title) {
    youtubeTitle(r.url).then(t => {
      if (!t) return;
      history.update(r.url, { title: t });
      if (current?.url === r.url) { current.title = t; el.sub.textContent = itemLabel(current); }
    });
  }
}

/* ================= スキャンを受け取ったとき ================= */
function handleScan(scan) {
  const r = route(scan);

  // 同じものを続けて読んだら無視（ピッピッと2回鳴らしてしまった時など）
  const now = Date.now();
  if (r.text === lastScan.text && now - lastScan.at < CONFIG.sameScanCooldownMs) return;
  lastScan = { text: r.text, at: now };

  addLog(scan, r);
  if (isParent()) return;      // おやモード中は「確認」だけ（開かない）

  if (r.type === 'url') {
    if (!allow.isAllowed(r.host)) {
      pending.push({ url: r.url, host: r.host });
      beep(false);
      closeMedia(el.media); el.mediaDrop.hidden = true; current = null;
      return show({ title: 'おうちの人に きいてね', sub: `まだ ひらけない QR（${siteName(r.host)}）` });
    }
    beep(true); flash();
    const old = history.list().find(h => h.url === r.url);   // 前に開いた教材なら題名を引き継ぐ
    return openItem({ ...r, title: old?.title });
  }

  if (r.type === 'card') { beep(true); return show({ title: 'カードを よみとったよ', sub: 'これから つかえるように なるよ' }); }
  if (r.type === 'isbn') { beep(true); return show({ title: '本の バーコードを よみとったよ', sub: 'これから つかえるように なるよ' }); }
  beep(false);
  show({ title: 'これは 教材の QR じゃないみたい', sub: 'ほかの QR を ピッ してね' });
}

startScanner(handleScan);

// 教材タブを閉じたら、最初の画面に自動でもどる
setInterval(() => {
  if (current?.kind === 'page' && el.act.hidden && tabClosed() && !isParent()) goIdle();
}, 1000);

// スキャナーの文字は「いま前に出ている画面」に届く。この画面が裏にある時はそれを知らせる
function updateReady() {
  const on = document.hasFocus();
  el.ready.classList.toggle('off', !on);
  el.readyText.textContent = on ? '読み取り待ち' : 'この画面で 読めるよ';
}
window.addEventListener('focus', updateReady);
window.addEventListener('blur', updateReady);
setInterval(updateReady, 1500);

/* ================= 履歴（時計ボタン） ================= */
const ICON_OPEN = `<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;
const ICON_AUDIO = `<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>`;
const KIND = { youtube: 'どうが', video: 'どうが', audio: 'おんせい', page: 'ページ' };

function thumb(h) {
  if (h.kind === 'youtube' && h.youtubeId)
    return `<img src="https://i.ytimg.com/vi/${encodeURIComponent(h.youtubeId)}/mqdefault.jpg" alt="">`;
  if (h.kind === 'audio' || h.kind === 'video') return ICON_AUDIO;
  return `<img class="fav" src="https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(h.host)}" alt="">`;
}

function renderHistory() {
  const l = history.list().slice(0, 5);
  el.histList.innerHTML = l.length ? l.map((h, i) => `
    <li data-i="${i}">
      <div class="thumb">${thumb(h)}</div>
      <div class="h-text">
        <div class="h-title">${esc(h.title || siteName(h.host))}</div>
        <div class="h-sub">${esc(h.title ? siteName(h.host) : (pageHint(h.url) || KIND[h.kind] || 'ページ'))} ・ ${whenLabel(h.at)}</div>
      </div>
      <div class="h-open">${ICON_OPEN}</div>
    </li>`).join('')
    : `<li class="empty">まだ ひらいた教材は ないよ</li>`;
}

el.histBtn.onclick = () => {
  const open = el.hist.hidden;
  el.hist.hidden = !open;
  el.histBtn.classList.toggle('on', open);
  if (open) { el.mediaDrop.hidden = true; renderHistory(); }
  else if (current && el.media.innerHTML) el.mediaDrop.hidden = false;
};

el.histList.addEventListener('click', e => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  const h = history.list()[Number(li.dataset.i)];
  const r = classify(h.url);
  if (r.type === 'url') { flash(); openItem({ ...r, title: h.title }); }
});

/* ================= おやモード（ロゴ「ピッとナマピ」を1.5秒長押し） ================= */
let pressTimer = null;
el.brand.addEventListener('pointerdown', () => {
  el.brand.classList.add('pressing');
  pressTimer = setTimeout(() => setParent(true), 1500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.brand.addEventListener(t, () => {
  el.brand.classList.remove('pressing'); clearTimeout(pressTimer);
}));
el.brand.addEventListener('contextmenu', e => e.preventDefault());   // 長押しでメニューが出ないように
el.back.onclick = () => setParent(false);

function setParent(on) {
  el.brand.classList.remove('pressing');
  document.body.classList.toggle('child-mode', !on);
  el.hist.hidden = true; el.histBtn.classList.remove('on');
  if (on) { closeMedia(el.media); refreshParent(); }
  else goIdle();
}

function refreshParent() {
  el.openAll.checked = allow.openAll();
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
el.openAll.onchange = () => allow.setOpenAll(el.openAll.checked);
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
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 開発中の確認用（コンソールから classify('https://...') を試せる）
window.studyDesk = { classify, allow, pending, history };

goIdle();
