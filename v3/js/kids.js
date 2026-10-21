// ===== 子ども3人：名前・色・「いま使っているのは誰か」 =====
// 名前はこの端末のブラウザ内だけに保存（GitHubには載らない）
import { CONFIG, store } from './config.js?v=4.7';

export const KID_COLORS = ['#E07A4F', '#368C85', '#4F6FB0'];
const DEFAULT = [1, 2, 3].map(n => ({ id: n, name: `${n}ばんめ` }));

export const kids = {
  list() {
    const saved = store.get('kids', DEFAULT);
    return DEFAULT.map((d, i) => ({ ...d, ...(saved[i] || {}), color: KID_COLORS[i] }));
  },
  get(id) { return this.list().find(k => k.id === Number(id)) || null; },
  rename(id, name) {
    const l = this.list().map(({ id: i, name: n }) => ({ id: i, name: i === Number(id) ? (name.trim() || `${i}ばんめ`) : n }));
    store.set('kids', l);
  },
};

// いま使っている子。しばらく何も読まなければ自動で「だれもいない」に戻す（きょうだいの記録まちがい防止）
let currentId = null, lastActive = 0;
export const session = {
  get() {
    if (currentId && Date.now() - lastActive > CONFIG.kidTimeoutMin * 60000) currentId = null;
    return currentId ? kids.get(currentId) : null;
  },
  set(id) { currentId = Number(id); lastActive = Date.now(); },
  touch() { if (currentId) lastActive = Date.now(); },
  clear() { currentId = null; },
};

// なまえカードの中身：SD-USER-1 / SD-USER-2 / SD-USER-3
export const kidFromCard = id => { const m = /^SD-USER-([1-3])$/.exec(id); return m ? Number(m[1]) : null; };
