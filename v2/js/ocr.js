// ===== OCR（文字の読み取り）担当 =====
// 本命: Claudeの画像読み取り（縦書き・ふりがな・カメラ画像に強い）
// 予備: Tesseract（APIキーが無いとき用。日本語のカメラ画像はかなり苦手）
import { callClaude } from './ai.js';

const OCR_SYSTEM = `あなたは教科書・絵本・問題集の文字を書き起こすOCRです。
写真に写っている「本文」を、読む順番どおりに正確に書き起こしてください。

ルール:
- 縦書きは右の行から左へ、横書きは上から下へ読む
- 見開きなら右ページ→左ページ（横書きの洋書は左→右）
- ふりがな（ルビ）は書かない。本文の漢字だけを書く
- ページ番号・柱（欄外の見出し）・写っている指や机は無視する
- 段落の区切りは空行1つで表す。段落の途中の改行は入れずにつなげる
- 誤字を直したり、言い換えたりしない
- 読めない部分は「…」とする
- 説明・前置き・記号の装飾は一切書かず、書き起こした本文だけを出力する
- 文字がほとんど写っていなければ「（文字が見つかりません）」とだけ出力する`;

export async function ocrWithClaude(canvas, apiKey) {
  const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  const text = await callClaude({
    apiKey,
    system: OCR_SYSTEM,
    maxTokens: 3000,
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: 'この写真の本文を書き起こしてください。' },
    ],
  });
  return toParagraphs(text);
}

let tesseractLoaded = null;
export async function ocrWithTesseract(canvas, onProgress) {
  if (!tesseractLoaded) {
    tesseractLoaded = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  await tesseractLoaded;
  // 白黒にして文字をくっきりさせてから読ませる
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  const { data } = await window.Tesseract.recognize(canvas, 'jpn+eng', {
    logger: m => m.status === 'recognizing text' && onProgress?.(m.progress),
  });
  // Tesseractは日本語の文字間にスペースを入れがちなので除去
  const cleaned = (data.text || '').replace(/(?<=[　-鿿])\s+(?=[　-鿿])/g, '');
  return toParagraphs(cleaned);
}

function toParagraphs(text) {
  if (!text || /文字が見つかりません/.test(text)) return [];
  return text.split(/\n\s*\n/)
    .map(p => p.replace(/\s*\n\s*/g, ' ')
      .replace(/(?<=[　-鿿＀-￯])\s+(?=[　-鿿＀-￯])/g, '')
      .trim())
    .filter(Boolean);
}
