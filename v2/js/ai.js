// ===== Claude API 担当 =====
// APIへの通信はすべてこのファイルを通す（将来サーバー経由に変えるときもここだけ直せばOK）
import { CONFIG } from './config.js';

export async function callClaude({ apiKey, system, content, maxTokens = 1500 }) {
  if (!apiKey) throw new Error('おやモードでClaude APIキーを設定してください');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CONFIG.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `通信エラー (${res.status})`);
  }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

// 英文の「むずかしい単語だけ」日本語に置き換える
export function easyEnglish({ apiKey, text, grade }) {
  const system = `あなたは日本の子ども向け英語学習アシスタントです。
対象は「${grade}」の子どもです。
・その学年ではまだ知らなそうな単語だけを日本語に置き換える
・基礎単語（I, am, is, the, a, you, like など）は英語のまま残す
・語順や文の構造は変えない（全文翻訳はしない）
・説明や前置きは書かず、変換後の文だけを出力する
例: The weather is beautiful today. → The 天気 is 美しい today.`;
  return callClaude({ apiKey, system, content: text, maxTokens: 800 });
}
