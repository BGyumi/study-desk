// ===== アプリ本体：画面とそれぞれの部品（カメラ・QR・OCR・読み上げ）をつなぐ =====
import { CONFIG, store, VERSION } from './config.js?v=2.2';
import { Camera } from './camera.js?v=2.2';
import { createQrScanner, classifyQr } from './qr.js?v=2.2';
import { ocrWithClaude, ocrWithTesseract } from './ocr.js?v=2.2';
import { speakParagraphs, stopSpeaking, detectLang, voiceSummary } from './speech.js?v=2.2';
import { easyEnglish } from './ai.js?v=2.2';

const $ = id => document.getElementById(id);
const el = {
  brand: $('brand'), back: $('backToChild'),
  video: $('video'), videoWrap: $('videoWrap'),
  overlay: $('overlay'), overlayMain: $('overlayMain'), overlaySub: $('overlaySub'), retryCam: $('retryCam'),
  focusBadge: $('focusBadge'), readBtn: $('readBtn'), stopBtn: $('stopBtn'), hint: $('hint'),
  qrPanel: $('qrPanel'), textPanel: $('textPanel'), extraRow: $('extraRow'),
  easyBtn: $('easyBtn'), easyResult: $('easyResult'),
  camSelect: $('camSelect'), focusBox: $('focusBox'), zoomBox: $('zoomBox'), camInfo: $('camInfo'),
  apiKey: $('apiKey'), ocrEngine: $('ocrEngine'), grade: $('grade'),
  rate: $('rate'), rateVal: $('rateVal'), voiceInfo: $('voiceInfo'), qrInfo: $('qrInfo'),
};

const camera = new Camera(el.video);
const state = { paragraphs: [], busy: false, lastQr: '', lastQrAt: 0, sharp: 0 };

/* ================= モード切替（ロゴ長押し 1.5秒でおやモード） ================= */
let pressTimer = null;
const startPress = () => { el.brand.classList.add('pressing'); pressTimer = setTimeout(() => setParent(true), 1500); };
const endPress = () => { el.brand.classList.remove('pressing'); clearTimeout(pressTimer); };
el.brand.addEventListener('pointerdown', startPress);
['pointerup', 'pointerleave', 'pointercancel'].forEach(e => el.brand.addEventListener(e, endPress));
el.back.onclick = () => setParent(false);
function setParent(on) {
  endPress();
  document.body.classList.toggle('child-mode', !on);
  if (on) refreshDiagnostics();
}

/* ================= 設定の読み込み ================= */
const grades = ['小学1年', '小学2年', '小学3年', '小学4年', '小学5年', '小学6年', '中学1年', '中学2年', '中学3年'];
el.grade.innerHTML = grades.map(g => `<option>${g}</option>`).join('');
el.grade.value = store.get('grade', '小学3年');
el.apiKey.value = store.get('apiKey', '');
el.ocrEngine.value = store.get('ocrEngine', 'auto');
el.rate.value = store.get('rate', CONFIG.defaultRate);
const showRate = () => (el.rateVal.textContent = `×${Number(el.rate.value).toFixed(2)}`);
showRate();

el.grade.onchange = () => store.set('grade', el.grade.value);
el.apiKey.onchange = () => { store.set('apiKey', el.apiKey.value.trim()); updateReadBtn(); };
// OCRはAPIキーを入れたときだけ子どもに見せる（キー無しの無料OCRは精度が低く、混乱のもとになるため）
function updateReadBtn() { el.readBtn.hidden = !el.apiKey.value.trim() && el.ocrEngine.value !== 'tesseract'; }
updateReadBtn();
el.ocrEngine.onchange = () => { store.set('ocrEngine', el.ocrEngine.value); updateReadBtn(); };
el.rate.oninput = () => { store.set('rate', el.rate.value); showRate(); };

/* ================= カメラ ================= */
function showOverlay(main, sub, showRetry = false) {
  el.overlay.hidden = false;
  el.overlayMain.textContent = main;
  el.overlaySub.textContent = sub;
  el.retryCam.hidden = !showRetry;
}

async function startCamera(deviceId = store.get('cameraId')) {
  showOverlay('本を置いてください', 'カメラをじゅんびしています…');
  try {
    const info = await camera.start(deviceId || undefined);
    store.set('cameraId', info.deviceId || '');
    el.overlay.hidden = true;
    el.readBtn.disabled = false;
    el.focusBadge.hidden = false;
    await fillCameraList();
    buildFocusControls();
  } catch (e) {
    console.error(e);
    const denied = e.name === 'NotAllowedError';
    showOverlay('カメラがつかえません',
      denied ? 'カメラの使用を「許可」してください（アドレスバー左のアイコン）' : 'USBカメラがささっているか確認してね', true);
  }
}
el.retryCam.onclick = () => startCamera();

async function fillCameraList() {
  const cams = await camera.listCameras();
  const current = camera.info().deviceId;
  el.camSelect.innerHTML = cams.map((c, i) =>
    `<option value="${c.deviceId}" ${c.deviceId === current ? 'selected' : ''}>${c.label || 'カメラ ' + (i + 1)}</option>`).join('');
}
el.camSelect.onchange = () => startCamera(el.camSelect.value);
navigator.mediaDevices?.addEventListener?.('devicechange', fillCameraList);

// ピント・ズームの操作部品は「そのカメラが対応しているときだけ」出す
function buildFocusControls() {
  const info = camera.info();
  el.focusBox.innerHTML = '';
  el.zoomBox.innerHTML = '';

  if (info.focusDistance && info.focusModes.includes('manual')) {
    const { min, max, step } = info.focusDistance;
    const saved = store.get('focusDistance');
    el.focusBox.innerHTML = `
      <label><input type="checkbox" id="afToggle" ${saved ? '' : 'checked'}> オートフォーカス</label>
      <label>手動ピント <input type="range" id="focusRange" min="${min}" max="${max}" step="${step || (max - min) / 100}" value="${saved ?? (min + max) / 2}" ${saved ? '' : 'disabled'}></label>`;
    const af = $('afToggle'), fr = $('focusRange');
    if (saved) camera.setManualFocus(saved).catch(() => {});
    af.onchange = async () => {
      fr.disabled = af.checked;
      if (af.checked) { store.set('focusDistance', ''); await camera.setAutoFocus().catch(() => {}); }
      else { store.set('focusDistance', fr.value); await camera.setManualFocus(fr.value).catch(() => {}); }
    };
    fr.oninput = () => { store.set('focusDistance', fr.value); camera.setManualFocus(fr.value).catch(() => {}); };
  } else if (info.focusModes.includes('continuous')) {
    el.focusBox.innerHTML = `<p class="diag">オートフォーカス：ON（このカメラは手動ピント非対応）</p>`;
  } else {
    el.focusBox.innerHTML = `<p class="diag warn">このカメラはピント調整ができない「固定焦点」です。<br>
      本から <b>30〜40cm以上</b> はなすとピントが合いやすくなります（近すぎるとボケます）。<br>
      ずっとボケる場合はオートフォーカス付きの書画カメラへの交換がおすすめです。</p>`;
  }

  if (info.zoom) {
    const { min, max, step } = info.zoom;
    const saved = store.get('zoom', min);
    el.zoomBox.innerHTML = `<label>ズーム <input type="range" id="zoomRange" min="${min}" max="${max}" step="${step || 0.1}" value="${saved}"></label>`;
    camera.setZoom(saved).catch(() => {});
    $('zoomRange').oninput = e => { store.set('zoom', e.target.value); camera.setZoom(e.target.value).catch(() => {}); };
  }
  refreshDiagnostics();
}

// ピントの合い具合を0.4秒ごとに表示
setInterval(() => {
  if (!camera.ready) return;
  state.sharp = camera.sharpness();
  const s = state.sharp;
  const [cls, label] = s >= CONFIG.sharpGood ? ['good', 'ピント ◎'] : s >= CONFIG.sharpOk ? ['ok', 'ピント ○'] : ['bad', 'ピント ×'];
  el.focusBadge.className = 'focus-badge ' + cls;
  el.focusBadge.textContent = label;
  if (!document.body.classList.contains('child-mode')) refreshDiagnostics();
}, 400);

/* ================= QRコード（常に自動で探す） ================= */
let qr = null;
createQrScanner().then(s => { qr = s; refreshDiagnostics(); qrLoop(); })
  .catch(e => { el.qrInfo.textContent = 'QR読み取りを準備できませんでした: ' + e.message; });

async function qrLoop() {
  if (camera.ready && !state.busy) {
    try {
      const r = await qr.detect(el.video);
      state.qrTries = (state.qrTries || 0) + 1;
      const text = r?.text;
      const isUrl = text && /^https?:\/\//i.test(text);
      const parent = !document.body.classList.contains('child-mode');
      if (text && (isUrl || parent) && (text !== state.lastQr || Date.now() - state.lastQrAt > CONFIG.qrCooldownMs)) {
        state.lastQr = text; state.lastQrAt = Date.now();
        state.qrHits = (state.qrHits || 0) + 1;
        flash();
        showQr(text);
        el.hint.textContent = '';
      } else if (r?.seen && Date.now() - state.lastQrAt > 2000) {
        // QRらしきものは見えているのに読めない → 子どもに分かる言葉で伝える
        el.hint.textContent = 'QRコードが見えたよ！もう少し大きく・まっすぐうつしてね';
        state.seenAt = Date.now();
      } else if (state.seenAt && Date.now() - state.seenAt > 3000 && el.hint.textContent.startsWith('QR')) {
        el.hint.textContent = '';
      }
    } catch (e) { state.qrError = e.message; }
  }
  setTimeout(qrLoop, CONFIG.qrIntervalMs);
}

function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  el.videoWrap.appendChild(f);
  setTimeout(() => f.remove(), 800);
}

function showQr(text) {
  const q = classifyQr(text);
  const p = el.qrPanel;
  p.hidden = false;
  p.innerHTML = `<div class="qr-title"><span>📎 QRコードを見つけたよ</span><button class="btn small wood" id="qrClose">とじる</button></div>`;
  if (q.type === 'youtube') {
    p.insertAdjacentHTML('beforeend', `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(q.id)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`);
  } else if (q.type === 'audio' || q.type === 'video') {
    const m = document.createElement(q.type);
    m.src = q.url; m.controls = true; m.autoplay = true;
    p.appendChild(m);
    m.play().catch(() => {});
  } else if (q.type === 'link') {
    // 多くの教材サイトは埋め込み表示を禁止しているので、新しいタブで開く
    const a = document.createElement('a');
    a.href = q.url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'btn amber'; a.style.display = 'block'; a.style.textAlign = 'center'; a.style.textDecoration = 'none';
    a.textContent = `▶ ひらく（${q.host}）`;
    p.appendChild(a);
  } else {
    const d = document.createElement('div');
    d.textContent = q.text;
    p.appendChild(d);
  }
  $('qrClose').onclick = () => { p.hidden = true; p.innerHTML = ''; };
}

/* ================= よんで（撮影 → OCR → 読み上げ） ================= */
el.readBtn.onclick = async () => {
  if (state.busy || !camera.ready) return;
  state.busy = true;
  stopSpeaking();
  el.readBtn.disabled = true;
  el.easyResult.hidden = true;
  el.extraRow.hidden = true;

  try {
    // 1秒ほどの間に何枚か見て、いちばんピントが合っている瞬間を使う
    el.readBtn.textContent = '📷 とるよ…';
    const shot = await captureSharpest(8, 120);
    if (shot.sharp < CONFIG.sharpOk) el.hint.textContent = 'ピントがあっていないかも。本を少しはなしてみてね';
    else el.hint.textContent = '';

    el.readBtn.textContent = '⏳ よみとり中…';
    el.textPanel.innerHTML = `<div class="loading">文字をよんでいるよ…</div>`;

    const engine = pickEngine();
    let paras;
    if (engine === 'claude') {
      paras = await ocrWithClaude(shot.canvas, el.apiKey.value.trim());
    } else {
      paras = await ocrWithTesseract(camera.capture(2400), p => (el.readBtn.textContent = `⏳ よみとり中… ${Math.round(p * 100)}%`));
    }

    state.paragraphs = paras;
    renderParagraphs();
    if (!paras.length) {
      el.textPanel.innerHTML = `<div class="placeholder">文字が見つからなかったよ。<br>本をまっすぐ置いて、もう一回「よんで」をおしてね</div>`;
    } else {
      el.extraRow.hidden = !paras.some(p => detectLang(p) === 'en-US');
      readFrom(0);
    }
  } catch (e) {
    console.error(e);
    el.textPanel.innerHTML = `<div class="placeholder">うまく読めなかったよ<br><small>${escapeHtml(e.message)}</small></div>`;
  } finally {
    state.busy = false;
    el.readBtn.disabled = false;
    el.readBtn.textContent = '📖 よんで';
  }
};

function pickEngine() {
  const mode = el.ocrEngine.value;
  if (mode === 'tesseract') return 'tesseract';
  if (mode === 'claude') return 'claude';
  return el.apiKey.value.trim() ? 'claude' : 'tesseract';
}

async function captureSharpest(frames, gapMs) {
  let best = { sharp: -1, canvas: null };
  for (let i = 0; i < frames; i++) {
    const s = camera.sharpness();
    if (s > best.sharp) best = { sharp: s, canvas: camera.capture(CONFIG.ocrMaxEdge) };
    await new Promise(r => setTimeout(r, gapMs));
  }
  return best;
}

function renderParagraphs() {
  el.textPanel.innerHTML = '';
  state.paragraphs.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'para' + (detectLang(p) === 'en-US' ? ' en' : '');
    d.textContent = p;
    d.onclick = () => readFrom(i);           // タップした段落から読む
    el.textPanel.appendChild(d);
  });
}

function readFrom(i) {
  el.stopBtn.hidden = false;
  speakParagraphs(state.paragraphs, {
    start: i,
    rate: Number(el.rate.value),
    onParagraph: idx => {
      [...el.textPanel.children].forEach((c, n) => c.classList.toggle('reading', n === idx));
      el.textPanel.children[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    onEnd: () => (el.stopBtn.hidden = true),
  });
}

el.stopBtn.onclick = () => {
  stopSpeaking();
  el.stopBtn.hidden = true;
  [...el.textPanel.children].forEach(c => c.classList.remove('reading'));
};

/* ================= むずかしい単語だけ日本語に ================= */
el.easyBtn.onclick = async () => {
  const text = state.paragraphs.filter(p => detectLang(p) === 'en-US').join('\n\n');
  el.easyResult.hidden = false;
  el.easyResult.textContent = '考えています…';
  try {
    el.easyResult.textContent = await easyEnglish({ apiKey: el.apiKey.value.trim(), text, grade: el.grade.value });
  } catch (e) {
    el.easyResult.textContent = '⚠️ ' + e.message;
  }
};

/* ================= 診断表示（おやモード） ================= */
function refreshCamInfo() {
  const i = camera.info();
  const low = i.width && i.width < 1280;
  el.camInfo.innerHTML = `カメラ: ${escapeHtml(i.label || '-')}<br>
    実際の解像度: <span class="${low ? 'warn' : ''}">${i.width}×${i.height}</span>${low ? '（低い：小さい字は読みにくい）' : ''}<br>
    ピント数値: ${Math.round(state.sharp)}（${CONFIG.sharpOk}以上で○ / ${CONFIG.sharpGood}以上で◎）`;
}
function refreshDiagnostics() {
  refreshCamInfo();
  el.voiceInfo.textContent = '声: ' + voiceSummary();
  el.qrInfo.textContent = 'QR読み取り: ' + (qr?.engine || '準備中…') +
    ` ／ 試行 ${state.qrTries || 0}回・成功 ${state.qrHits || 0}回` + (state.qrError ? ` ／ エラー: ${state.qrError}` : '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= 起動 ================= */
startCamera();

// 今どの版が動いているか、ロゴの横に小さく表示（更新が反映されたかの確認用）
el.brand.insertAdjacentHTML('beforeend', ` <small style="font-size:13px;opacity:.6">v${VERSION}</small>`);
