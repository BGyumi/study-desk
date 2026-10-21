// ===== アプリ本体：スキャナー → 振り分け → 表示 をつなぐ =====
import { CONFIG, VERSION } from './config.js?v=4.5';
import { startScanner } from './scanner.js?v=4.5';
import { route, classify } from './router.js?v=4.5';
import { allow, pending } from './allow.js?v=4.5';
import { showMedia, openTab, closeMedia, tabClosed } from './media.js?v=4.5';
import { history, siteName, whenLabel, youtubeTitle, pageHint } from './history.js?v=4.5';
import { kids, session, kidFromCard } from './kids.js?v=4.5';
import { reading, lookupIsbn, isPriceBarcode, exportBackup, importBackup } from './reading.js?v=4.5';
import { captureCover } from './coverCam.js?v=4.5';

const $ = id => document.getElementById(id);
const el = {
  ver: $('ver'), fox: $('fox'), title: $('title'), sub: $('sub'), act: $('act'),
  ready: $('ready'), readyText: $('readyText'),
  histBtn: $('histBtn'), brand: $('brand'), hist: $('hist'), histList: $('histList'),
  mediaDrop: $('mediaDrop'), media: $('media'),
  back: $('backToChild'), pendingList: $('pendingList'), allowList: $('allowList'),
  allowForm: $('allowForm'), openAll: $('openAll'), allowInput: $('allowInput'),
  kidChip: $('kidChip'), shelfBtn: $('shelfBtn'), shelf: $('shelf'), shelfHead: $('shelfHead'), shelfBody: $('shelfBody'),
  kidNames: $('kidNames'), readList: $('readList'), readForm: $('readForm'), readKid: $('readKid'), readTitle: $('readTitle'),
  backupBtn: $('backupBtn'), restoreFile: $('restoreFile'),
  scanLog: $('scanLog'), testForm: $('testForm'), testInput: $('testInput'),
};
el.ver.textContent = 'v' + VERSION;

const FOX = { sleep: 'img/fox-sleep.png', awake: 'img/fox-awake.png' };
const isParent = () => !document.body.classList.contains('child-mode');
const log = [];               // スキャン履歴（おやモードの確認用・最新10件）
let lastScan = { text: '', at: 0 };
let current = null;           // いま開いているもの

/* ================= こどもモード：バーの表示 ================= */
// fox: 'sleep' | 'awake'、act: ボタン文字、onAct: ボタンを押した時の動き
let actFn = null;
function show({ fox = 'awake', title, sub = '', act = '', onAct = null }) {
  actFn = act ? onAct : null;
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

el.act.onclick = () => actFn?.();
const openCurrentTab = () => {
  if (current && openTab(current.url)) show({ title: '教材をひらきました', sub: itemLabel(current) });
};

// 吹き出し（履歴・本だな・再生）は1つだけ出す
function closeDrops() {
  el.hist.hidden = true; el.histBtn.classList.remove('on');
  el.shelf.hidden = true; el.shelfBtn.classList.remove('on');
}

/* ================= 教材を開く（スキャンでも履歴からでも同じ） ================= */
function openItem(r) {
  closeMedia(el.media);
  closeDrops();
  current = r;

  const { opened } = showMedia(el.media, r);
  el.mediaDrop.hidden = opened !== 'panel';
  if (opened === 'blocked') show({ title: 'ボタンで ひらいてね', sub: itemLabel(r), act: '▶ ひらく', onAct: openCurrentTab });
  else show({ title: '教材をひらきました', sub: itemLabel(r) });

  history.add({ url: r.url, host: r.host, kind: r.kind, youtubeId: r.youtubeId, listId: r.listId, title: r.title });
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
  session.touch();

  if (r.type === 'url') {
    if (r.kind === 'ytother') {   // YouTubeのチャンネル・検索ページなど：ブラウザでは開かない
      beep(false);
      closeMedia(el.media); el.mediaDrop.hidden = true; current = null;
      return show({ title: 'この どうがは ここでは みられないよ', sub: 'おうちの人に きいてね' });
    }
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

  if (r.type === 'card') {
    const id = kidFromCard(r.id);
    beep(true);
    if (!id) return show({ title: 'カードを よみとったよ', sub: 'これから つかえるように なるよ' });
    return selectKid(id);
  }
  if (r.type === 'isbn') { beep(true); return onBook(r.isbn); }
  beep(false);
  if (isPriceBarcode(r.text)) return show({ title: 'うえの バーコードを ピッ してね', sub: '本の うらの 2つの バーコードの うち、うえの ほうだよ' });
  show({ title: 'これは 教材の QR じゃないみたい', sub: 'ほかの QR を ピッ してね' });
}

startScanner(handleScan);

/* ================= 読書通帳 ================= */
let waitingBook = null;   // 名前より先に本をピッした時、少しのあいだ覚えておく

function selectKid(id) {
  session.set(id);
  renderKidChip();
  const k = kids.get(id);
  if (waitingBook && Date.now() - waitingBook.at < 120000) {
    const isbn = waitingBook.isbn; waitingBook = null;
    return recordBook(k, isbn);
  }
  show({ title: `${k.name}さん、こんにちは！`, sub: `本の バーコードを ピッ すると 読書通帳に はいるよ（いま ${reading.count(id)}冊）` });
}

function onBook(isbn) {
  const k = session.get();
  if (!k) {
    waitingBook = { isbn, at: Date.now() };
    return show({ title: 'だれが よんだのかな？', sub: 'じぶんの なまえカードを ピッ してね' });
  }
  recordBook(k, isbn);
}

async function recordBook(k, isbn) {
  closeMedia(el.media); el.mediaDrop.hidden = true; current = null;
  show({ title: '本を しらべているよ…', sub: '' });
  const info = await lookupIsbn(isbn);
  const { added, rec } = reading.add({
    kid: k.id, isbn,
    title: info?.title || `なまえの わからない本（${isbn}）`,
    author: info?.author, cover: info?.cover,
  });
  if (!info?.title && added) reading.update(rec.id, { unknown: true });
  if (!added) {
    show({ title: 'この本は きょう もう きろく したよ', sub: rec.title });
  } else {
    flash();
    show({
      title: `${k.name}さん ${reading.count(k.id)}冊目！ やったね`,
      sub: rec.cover ? (info?.title ? rec.title : '本の なまえは おうちの人が いれてくれるよ')
                     : 'ひょうしが みつからなかったよ。カメラで とってみよう',
      ...(rec.cover ? {} : { act: '📷 ひょうしを とる', onAct: () => takeCover(rec.id) }),
    });
  }
  openShelf(rec.id);
}

// 表紙が無い本：USBカメラで撮って、その本の表紙にする
async function takeCover(id) {
  const img = await captureCover();
  if (!img) return;
  reading.update(id, { cover: img });
  if (isParent()) return refreshReading();
  flash();
  show({ title: 'ひょうしが はいったよ！', sub: reading.list().find(r => r.id === id)?.title || '' });
  openShelf(id);
}

function renderKidChip() {
  const k = session.get();
  el.kidChip.hidden = !k;
  if (k) el.kidChip.innerHTML = `<i style="background:${k.color}">${esc(k.name.slice(0, 1))}</i>${esc(k.name)}`;
}
setInterval(renderKidChip, 30000);   // 時間がたって「だれもいない」に戻った時に消す

function openShelf(highlightId) {
  closeDrops();
  el.mediaDrop.hidden = true;
  el.shelf.hidden = false; el.shelfBtn.classList.add('on');
  const k = session.get();
  if (!k) {
    el.shelfHead.textContent = 'どくしょ通帳';
    el.shelfBody.innerHTML = `<ul class="kid-rows">${kids.list().map(x =>
      `<li><i style="background:${x.color}">${esc(x.name.slice(0, 1))}</i>${esc(x.name)}<span>${reading.count(x.id)}冊</span></li>`).join('')}</ul>
      <div class="shelf-hint">なまえカードを ピッ すると、じぶんの 本だなが みられるよ</div>`;
    return;
  }
  const books = reading.byKid(k.id);
  el.shelfHead.innerHTML = `${esc(k.name)}さんの どくしょ通帳<span class="shelf-count"><b>${books.length}</b>冊</span>`;
  el.shelfBody.innerHTML = books.length ? `<div class="books">${books.slice(0, 18).map(b => `
    <div class="book ${b.id === highlightId ? 'new' : ''} ${b.cover ? '' : 'nocover'}" data-id="${b.id}">
      <div class="cv ${b.cover ? 'img' : ''}">${b.cover ? `<img src="${esc(b.cover)}" alt="" onerror="this.parentNode.classList.remove('img'); this.replaceWith(this.dataset.t)" data-t="${esc(b.title)}">` : esc(b.title)}</div>
      <div class="t">${esc(b.title)}</div><div class="d">${whenLabel(b.at)}</div>
    </div>`).join('')}</div>`
    : `<div class="shelf-hint" style="padding:24px">よんだ 本の バーコードを ピッ してみよう</div>`;
}

// 表紙の無い本をタッチ → カメラで撮る
el.shelfBody.addEventListener('click', e => {
  const b = e.target.closest('.book.nocover');
  if (b) takeCover(b.dataset.id);
});

el.shelfBtn.onclick = () => {
  if (!el.shelf.hidden) { closeDrops(); if (current && el.media.innerHTML) el.mediaDrop.hidden = false; return; }
  openShelf();
};

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
  closeDrops();
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
  closeDrops();
  if (on) { closeMedia(el.media); refreshParent(); }
  else goIdle();
}

function refreshReading() {
  const ks = kids.list();
  el.kidNames.innerHTML = ks.map(k => `
    <label style="--c:${k.color}">${k.id}ばんめ（SD-USER-${k.id}）・${reading.count(k.id)}冊
      <input data-kid="${k.id}" value="${esc(k.name)}" maxlength="12"></label>`).join('');
  el.readKid.innerHTML = ks.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('');
  const l = reading.list().slice(0, 20);
  el.readList.innerHTML = l.length ? l.map(r => {
    const k = kids.get(r.kid);
    return `<li><div class="rl-cv">${r.cover ? `<img src="${esc(r.cover)}" alt="">` : ''}</div><div style="flex:1"><b>${esc(r.title)}</b>
      <div class="meta">${esc(k?.name || '')} ・ ${new Date(r.at).toLocaleDateString('ja-JP')}${r.isbn ? ' ・ ISBN ' + r.isbn : ''}${r.unknown ? ' ・ <b style="color:var(--warn)">名前を入れてください</b>' : ''}</div></div>
      <div class="btns"><button class="btn ghost" data-cover="${r.id}">${r.cover ? '表紙をとりなおす' : '表紙をとる'}</button><button class="btn ghost" data-edit="${r.id}">名前をなおす</button><button class="btn ghost" data-delread="${r.id}">削除</button></div></li>`;
  }).join('') : `<li class="empty">まだ記録はありません</li>`;
}

el.kidNames.addEventListener('change', e => {
  const id = e.target.dataset.kid;
  if (id) { kids.rename(id, e.target.value); refreshReading(); renderKidChip(); }
});
el.readList.addEventListener('click', e => {
  if (e.target.dataset.cover) return takeCover(e.target.dataset.cover);
  const ed = e.target.dataset.edit, del = e.target.dataset.delread;
  const rec = reading.list().find(r => r.id === (ed || del));
  if (ed && rec) {
    const t = prompt('本の名前', rec.unknown ? '' : rec.title);
    if (t && t.trim()) reading.update(ed, { title: t.trim(), unknown: false });
  }
  if (del && rec && confirm(`「${rec.title}」の記録を削除しますか？`)) reading.remove(del);
  refreshReading();
});
el.readForm.onsubmit = e => {
  e.preventDefault();
  const t = el.readTitle.value.trim();
  if (!t) return;
  reading.add({ kid: Number(el.readKid.value), title: t });
  el.readTitle.value = '';
  refreshReading();
};
el.backupBtn.onclick = exportBackup;
el.restoreFile.onchange = async () => {
  const f = el.restoreFile.files[0];
  if (!f) return;
  if (!confirm('バックアップの内容で上書きします。よろしいですか？')) { el.restoreFile.value = ''; return; }
  try { const at = await importBackup(f); alert(`もどしました（${new Date(at).toLocaleString('ja-JP')} の保存）`); location.reload(); }
  catch (err) { alert(err.message); }
  el.restoreFile.value = '';
};

function refreshParent() {
  refreshReading();
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
window.studyDesk = { classify, allow, pending, history, reading, kids };

goIdle();
