// ===== 読み上げ（TTS）担当 =====
// ・段落ごとに日本語／英語を自動判定して声を切り替える
// ・Chromeは長い文を途中で止めることがあるので、1文ずつに分けて読む
// ・自然な声（Google / Natural / Online と付く声）を優先して選ぶ

const synth = window.speechSynthesis;
let voices = [];
function loadVoices() { voices = synth.getVoices(); }
loadVoices();
synth.addEventListener?.('voiceschanged', loadVoices);

export function detectLang(text) {
  const ja = (text.match(/[぀-ヿ一-鿿]/g) || []).length;
  return ja > text.length * 0.1 ? 'ja-JP' : 'en-US';
}

function pickVoice(lang) {
  const prefix = lang.slice(0, 2);
  const list = voices.filter(v => v.lang.replace('_', '-').startsWith(prefix));
  const score = v =>
    (/natural|online/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    (v.lang.replace('_', '-') === lang ? 1 : 0);
  return list.sort((a, b) => score(b) - score(a))[0] || null;
}

function splitSentences(text) {
  return text.match(/[^。！？!?.]+[。！？!?.]*["」』)）]*\s*/g)?.map(s => s.trim()).filter(Boolean) || [text];
}

let runId = 0;

// paragraphs: 文字列の配列。start番目から順に読む。onParagraph(i) で今どこを読んでいるか通知
export function speakParagraphs(paragraphs, { start = 0, rate = 1, onParagraph, onEnd } = {}) {
  stopSpeaking();
  const myRun = ++runId;
  const queue = [];
  paragraphs.forEach((p, i) => {
    if (i < start) return;
    const lang = detectLang(p);
    splitSentences(p).forEach(s => queue.push({ text: s, lang, para: i }));
  });

  let lastPara = -1;
  const next = () => {
    if (myRun !== runId) return;               // 途中で止められた
    const item = queue.shift();
    if (!item) { onParagraph?.(-1); onEnd?.(); return; }
    if (item.para !== lastPara) { lastPara = item.para; onParagraph?.(item.para); }
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = item.lang;
    const v = pickVoice(item.lang);
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = next;
    u.onerror = next;
    synth.speak(u);
  };
  next();
}

export function stopSpeaking() {
  runId++;
  synth.cancel();
}

export function isSpeaking() { return synth.speaking; }

export function voiceSummary() {
  const ja = pickVoice('ja-JP'), en = pickVoice('en-US');
  return `日本語: ${ja?.name || 'なし'} ／ 英語: ${en?.name || 'なし'}`;
}
