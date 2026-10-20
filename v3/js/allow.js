// ===== 許可サイト（ホワイトリスト）と承認待ち =====
// 子どもが読んだQRでも、許可したサイトだけ開く。それ以外は「承認待ち」に入れて、おやモードで決める。
import { CONFIG, store } from './config.js?v=3.1';

const KEY_ALLOW = 'allow', KEY_PENDING = 'pending';

export const allow = {
  list() { return store.get(KEY_ALLOW, CONFIG.defaultAllow); },

  // サブドメインも含めて許可（例：studysapuri.jp を許可 → learn.studysapuri.jp もOK）
  isAllowed(host) {
    if (this.openAll()) return true;
    return this.list().some(d => host === d || host.endsWith('.' + d));
  },

  add(domain) {
    const d = normalize(domain);
    if (!d) return false;
    const l = this.list();
    if (!l.includes(d)) store.set(KEY_ALLOW, [...l, d]);
    pending.removeHost(d);
    return true;
  },

  // おやモードの「許可サイト以外も開く」
  openAll() { return store.get('openAll', false); },
  setOpenAll(on) { store.set('openAll', !!on); },

  remove(domain) { store.set(KEY_ALLOW, this.list().filter(d => d !== domain)); },
};

export const pending = {
  list() { return store.get(KEY_PENDING, []); },
  push(item) {
    const l = this.list().filter(p => p.url !== item.url);
    store.set(KEY_PENDING, [{ ...item, at: Date.now() }, ...l].slice(0, 20));
  },
  removeUrl(url) { store.set(KEY_PENDING, this.list().filter(p => p.url !== url)); },
  removeHost(d) { store.set(KEY_PENDING, this.list().filter(p => !(p.host === d || p.host.endsWith('.' + d)))); },
};

// 「https://www.Example.com/abc」と入れても「example.com」にそろえる
export function normalize(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return '';
  try { s = new URL(s.includes('://') ? s : 'https://' + s).hostname; } catch { return ''; }
  s = s.replace(/^www\./, '');
  return s.includes('.') ? s : '';
}
