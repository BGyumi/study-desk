// ===== 履歴：さいきん開いた教材（この端末のブラウザ内に保存） =====
import { store } from './config.js?v=4.2';

const KEY = 'history', MAX = 20;

// よく使う教材サイトの呼び名（ここに足せば表示名が変わる）
const SITE_NAMES = {
  'littlefox.com': 'Little Fox', 'studysapuri.jp': 'スタディサプリ', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
  'zkai.co.jp': 'Z会', 'mpi-j.co.jp': 'mpi', 'mpi-j.com': 'mpi', 'nhk.or.jp': 'NHK',
  'tokyo-shoseki.co.jp': '東京書籍', 'kairyudo.co.jp': '開隆堂', 'mitsumura-tosho.co.jp': '光村図書',
  'gakken.co.jp': '学研', 'obunsha.co.jp': '旺文社', 'benesse.co.jp': 'ベネッセ', 'kumon.ne.jp': 'くもん',
  'oup.com': 'Oxford', 'oupjapan.co.jp': 'Oxford', 'shinko-keirin.co.jp': '新興出版社啓林館', 'bun-eido.co.jp': '文英堂',
};

export function siteName(host) {
  const hit = Object.keys(SITE_NAMES).find(d => host === d || host.endsWith('.' + d));
  return hit ? SITE_NAMES[hit] : host;
}

export const history = {
  list() { return store.get(KEY, []); },

  // 同じURLは一番上に移動（重複させない）
  add(item) {
    const l = this.list().filter(h => h.url !== item.url);
    store.set(KEY, [{ ...item, at: Date.now() }, ...l].slice(0, MAX));
  },

  // あとから分かった情報（YouTubeの題名など）を書き足す
  update(url, patch) {
    store.set(KEY, this.list().map(h => (h.url === url ? { ...h, ...patch } : h)));
  },
};

// 「きょう」「きのう」「3日まえ」
export function whenLabel(t) {
  const day = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const n = Math.round((day(Date.now()) - day(t)) / 86400000);
  return n <= 0 ? 'きょう' : n === 1 ? 'きのう' : `${n}日まえ`;
}

// YouTubeの題名を取りにいく（取れなければ null。取れなくても動作には影響なし）
export async function youtubeTitle(url) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url));
    if (!r.ok) return null;
    return (await r.json()).title || null;
  } catch { return null; }
}

// 題名が分からないページ用：URLの最後の部分（例：sokutan-churdl/scr-51）を目印にする
export function pageHint(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean).slice(-2)
      .map(x => decodeURIComponent(x).replace(/\.(html?|php|aspx?)$/i, ''));
    const t = parts.join('/');
    return t.length > 32 ? '…' + t.slice(-31) : t;
  } catch { return ''; }
}
