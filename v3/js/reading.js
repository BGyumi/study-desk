// ===== 読書通帳：本のバーコード（ISBN）→ 書名をしらべて記録 =====
import { store } from './config.js?v=4.3';

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

// 書名しらべ：openBD（日本の本に強い・無料）→ だめなら Google Books
const cache = {};
export async function lookupIsbn(isbn) {
  if (cache[isbn]) return cache[isbn];
  // 前にだれかが読んだ本なら、その時の情報を使う（ネットがなくてもOK）
  const known = reading.list().find(r => r.isbn === isbn && r.title && !r.unknown);
  if (known) return (cache[isbn] = { title: known.title, author: known.author, cover: known.cover });

  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const s = (await r.json())?.[0]?.summary;
    if (s?.title) return (cache[isbn] = { title: s.title, author: s.author || '', cover: s.cover || '' });
  } catch { /* 次をためす */ }
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const v = (await r.json())?.items?.[0]?.volumeInfo;
    if (v?.title) {
      return (cache[isbn] = {
        title: v.title, author: (v.authors || []).join('、'),
        cover: (v.imageLinks?.thumbnail || '').replace(/^http:/, 'https:'),
      });
    }
  } catch { /* 見つからなかった */ }
  return null;
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
