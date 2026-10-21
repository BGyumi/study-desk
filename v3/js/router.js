// ===== スキャン振り分け係：読んだ文字列が「何か」を判定する =====
// 種類：
//   url  … 教材のQR（https://〜）
//   card … 自作カード（SD-USER-1 など）※Phase2で使う
//   isbn … 本の裏のバーコード（978/979で始まる13桁）※Phase2で使う
//   other… それ以外

// スキャナーから来た2通りの読み方（raw / usText）から、正しそうな方を選んで判定する
export function route({ raw, usText }) {
  for (const text of [usText, raw]) {
    const r = classify(text.trim());
    if (r.type !== 'other') return { ...r, text: text.trim() };
  }
  return { type: 'other', text: usText.trim() || raw.trim() };
}

export function classify(text) {
  if (/^SD-[A-Z0-9-]+$/i.test(text)) return { type: 'card', id: text.toUpperCase() };   // 大文字小文字どちらでもOK
  if (/^97[89]\d{10}$/.test(text)) return { type: 'isbn', isbn: text };

  let url;
  try { url = new URL(text); } catch { return { type: 'other' }; }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return { type: 'other' };

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const media = mediaKind(url, host);
  return { type: 'url', url: url.href, host, ...media };
}

// URLの中身が「YouTube／音声ファイル／動画ファイル／ふつうのページ」のどれか
//   YouTubeは「動画1本」と「再生リスト」だけアプリ内で再生する。
//   チャンネルや検索ページなどはブラウザで開かない（家ではブラウザのYouTubeを止めているため）→ kind: 'ytother'
function mediaKind(url, host) {
  if (/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(host)) {
    let id = url.searchParams.get('v');
    if (!id && host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    if (!id) { const m = url.pathname.match(/\/(shorts|embed|live|v)\/([\w-]+)/); if (m && m[2] !== 'videoseries') id = m[2]; }
    const list = url.searchParams.get('list');
    const ok = x => x && /^[\w-]+$/.test(x);
    if (ok(id) || ok(list)) return { kind: 'youtube', youtubeId: ok(id) ? id : '', listId: ok(list) ? list : '' };
    return { kind: 'ytother' };
  }
  if (/\.(mp3|m4a|wav|aac|oga|ogg)$/i.test(url.pathname)) return { kind: 'audio' };
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return { kind: 'video' };
  return { kind: 'page' };
}
