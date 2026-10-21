// ===== 読書通帳：本のバーコード（ISBN）→ 書名をしらべて記録 =====
import { store } from './config.js?v=4.6';

const KEY = 'reading';

// 1冊の記録：{ id, kid, isbn, title, author, cover, at }
export const reading = {
  list() { return store.get(KEY, []); },
  byKid(kid) { return this.list().filter(r => r.kid === Number(kid)); },
  count(kid) { return this.byKid(kid).length; },

  // 同じ子が同じ本を同じ日にもう一度ピッした時は、2冊目に数えない
  add({ kid, isbn = '', title, author = '', cover = '' }) {
    const today = new Date().toDateString();
    const dup = isbn && this.list().find(r => r.kid === kid && r.isbn === isbn && new Date(r.at).toDateString() === today);
    if (dup) return { added: false, rec: dup };
    const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kid, isbn, title, author, cover, at: Date.now() };
    store.set(KEY, [rec, ...this.list()]);
    return { added: true, rec };
  },
  update(id, patch) { store.set(KEY, this.list().map(r => (r.id === id ? { ...r, ...patch } : r))); },
  remove(id) { store.set(KEY, this.list().filter(r => r.id !== id)); },
};

// 書名しらべ：openBD（日本の本に強い）→ Google Books → 国立国会図書館
// 表紙は「書名が見つかった所の表紙」→ 国立国会図書館の表紙 → Open Library の順に、実際に画像が出るものを使う
const cache = {};
export async function lookupIsbn(isbn) {
  if (cache[isbn]) return cache[isbn];
  // 前にだれかが読んだ本なら、その時の情報を使う（ネットがなくてもOK）
  const known = reading.list().find(r => r.isbn === isbn && r.title && !r.unknown && r.cover);
  if (known) return (cache[isbn] = { title: known.title, author: known.author, cover: known.cover });

  const info = { title: '', author: '', covers: [] };
  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const s = (await r.json())?.[0]?.summary;
    if (s?.title) { info.title = s.title; info.author = s.author || ''; if (s.cover) info.covers.push(s.cover); }
  } catch { /* 次をためす */ }
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const v = (await r.json())?.items?.[0]?.volumeInfo;
    if (v?.title && !info.title) { info.title = v.title; info.author = (v.authors || []).join('、'); }
    const t = v?.imageLinks?.thumbnail;
    if (t) info.covers.push(t.replace(/^http:/, 'https:').replace('&edge=curl', ''));
  } catch { /* 次をためす */ }
  if (!info.title) {
    try {
      const r = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}&cnt=1`);
      const x = new DOMParser().parseFromString(await r.text(), 'text/xml');
      const item = x.querySelector('item');
      const title = item?.getElementsByTagName('dc:title')[0]?.textContent || item?.querySelector('title')?.textContent;
      if (title) { info.title = title.trim(); info.author = item.getElementsByTagName('dc:creator')[0]?.textContent?.trim() || ''; }
    } catch { /* 見つからなかった */ }
  }
  info.covers.push(`https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`,
                   `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`);

  const cover = await firstImage(info.covers);
  if (!info.title && !cover) return null;
  return (cache[isbn] = { title: info.title, author: info.author, cover });
}

// おやモードの「表紙テスト」：探し先ごとに、つながったか・表紙があったかを調べる
export async function diagnoseCover(isbn) {
  const out = [];
  const tryJson = async (name, url, pick) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return out.push({ name, ok: false, note: `つながったが エラー（${r.status}）` }), '';
      const cover = pick(await r.json());
      out.push({ name, ok: !!cover, note: cover ? '表紙あり' : 'つながった・表紙なし' });
      return cover || '';
    } catch { out.push({ name, ok: false, note: 'つながらない（ブロック？）' }); return ''; }
  };
  const c1 = await tryJson('openBD', `https://api.openbd.jp/v1/get?isbn=${isbn}`, j => j?.[0]?.summary?.cover);
  const c2 = await tryJson('Google Books', `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
    j => j?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https:'));
  for (const [name, u] of [['openBDの画像', c1], ['Google Booksの画像', c2],
    ['国立国会図書館', `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`],
    ['Open Library', `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`]]) {
    if (!u) continue;
    const ok = !!(await firstImage([u]));
    out.push({ name, ok, note: ok ? '画像が出た' : '画像なし／ブロック', url: ok ? u : '' });
  }
  return out;
}

// 画像URLを順にためして、ちゃんと表示できた最初の1つを返す（小さすぎる「画像なし」画像ははじく）
async function firstImage(urls) {
  for (const u of urls) {
    const ok = await new Promise(res => {
      const img = new Image();
      const t = setTimeout(() => res(false), 5000);
      img.onload = () => { clearTimeout(t); res(img.naturalWidth > 20 && img.naturalHeight > 20); };
      img.onerror = () => { clearTimeout(t); res(false); };
      img.src = u;
    });
    if (ok) return u;
  }
  return '';
}

// 本の裏の「下のバーコード」（値段などの番号：191/192で始まる）
export const isPriceBarcode = t => /^19[12]\d{10}$/.test(t);

/* ===== バックアップ：この端末に保存しているもの全部を1つのファイルに ===== */
const PREFIX = 'aiStudyDesk3_';
export function exportBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
  }
  const blob = new Blob([JSON.stringify({ app: 'pitto-namapi', savedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `pitto-namapi-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'pitto-namapi' || typeof j.data !== 'object') throw new Error('ピッとナマピのバックアップファイルではありません');
  Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith(PREFIX)) localStorage.setItem(k, v); });
  return j.savedAt;
}
