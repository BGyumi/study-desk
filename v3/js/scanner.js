// ===== バーコードスキャナー担当（Eyoyo EY-015P / HIDキーボードモード） =====
// スキャナーは「とても速いキーボード」として文字を送ってくる。
// このファイルはそれを受け取って、1回分の読み取り結果として 'scan' イベントを出すだけ。
// スキャナーを買い替えても、直すのはこのファイルだけで済むようにしてある。
//
// ■ 配列ずれ対策
//   スキャナーは英語(US)キーボードとして送ってくるが、PCが日本語(JIS)配列だと
//   「:」が「+」になるなど記号が化ける。そこで2通りの読み方を同時に作る：
//     raw     … ブラウザが受け取った文字そのまま（e.key）
//     usText  … 押された物理キー（e.code）を US配列として読み直したもの
//   どちらが正しいかは router.js が判断する。

import { CONFIG } from './config.js?v=4.6';

// 物理キー → US配列の [通常, Shift] 文字
const US = {
  Backquote: ['`', '~'], Minus: ['-', '_'], Equal: ['=', '+'],
  BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'],
  Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
  Space: [' ', ' '],
  Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
  Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'],
  NumpadDivide: ['/', '/'], NumpadMultiply: ['*', '*'], NumpadSubtract: ['-', '-'],
  NumpadAdd: ['+', '+'], NumpadDecimal: ['.', '.'],
};

function usChar(e) {
  const c = e.code || '';
  if (c.startsWith('Key') && c.length === 4) {
    const ch = c.slice(3);
    return (e.shiftKey !== e.getModifierState?.('CapsLock')) ? ch : ch.toLowerCase();
  }
  if (c.startsWith('Numpad') && /^Numpad\d$/.test(c)) return c.slice(6);
  const pair = US[c];
  return pair ? pair[e.shiftKey ? 1 : 0] : '';
}

const isEditable = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function startScanner(onScan) {
  let raw = '', us = '', last = 0, fastCount = 0, idleTimer = null;
  let field = null, fieldValue = '';   // 入力欄に文字が流れ込んだときに元に戻すため

  const reset = () => { raw = ''; us = ''; fastCount = 0; field = null; clearTimeout(idleTimer); };

  const commit = () => {
    clearTimeout(idleTimer);
    // ほぼ全部が速い入力ならスキャナー（人の手打ちは除外）
    const isScan = raw.length >= CONFIG.scanMinLength && fastCount >= raw.length - 2;
    if (isScan) {
      if (field) field.value = fieldValue;            // 流れ込んだ文字を取り消す
      onScan({ raw, usText: us, at: new Date() });
    }
    reset();
  };

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // ショートカットは触らない
    const now = performance.now();
    const gap = now - last;
    last = now;

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (raw.length >= CONFIG.scanMinLength && gap < CONFIG.scanMaxGapMs * 3) {
        e.preventDefault();
        commit();
      } else reset();
      return;
    }

    const rawCh = e.key.length === 1 ? e.key : '';
    const usCh = usChar(e);
    if (!rawCh && !usCh) return;                       // Shiftだけ等は無視

    if (gap > CONFIG.scanMaxGapMs) {                  // 間があいた＝新しい入力の始まり
      reset();
      if (isEditable(document.activeElement)) { field = document.activeElement; fieldValue = field.value; }
    } else fastCount++;

    raw += rawCh || usCh;
    us += usCh || rawCh;

    // スキャナーらしい速さが続いたら、入力欄やIMEに渡さない
    if (fastCount >= 3) e.preventDefault();

    clearTimeout(idleTimer);
    idleTimer = setTimeout(commit, CONFIG.scanIdleCommitMs);
  }, true);
}
