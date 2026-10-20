// ===== 右側の表示担当：YouTube・音声・動画・ページを開く =====
import { CONFIG } from './config.js?v=3.0';

let popup = null;   // 別ウィンドウは1つだけを使い回す（増えないように）

// panel に表示する。ページ型は別ウィンドウ。戻り値：{ opened: 'panel' | 'popup' | 'blocked' }
export function showMedia(panel, r) {
  panel.innerHTML = '';

  if (r.kind === 'youtube') {
    // rel=0：関連動画を出さない（脱線防止）
    panel.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.youtubeId)}?autoplay=1&rel=0&modestbranding=1"
      allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
    return { opened: 'panel' };
  }

  if (r.kind === 'audio' || r.kind === 'video') {
    const m = document.createElement(r.kind);
    m.src = r.url; m.controls = true; m.autoplay = true;
    panel.appendChild(m);
    m.play().catch(() => {});
    return { opened: 'panel' };
  }

  // 多くの教材サイトは埋め込みを禁止しているので、画面の右半分に別ウィンドウで開く
  return { opened: openPopup(r.url) ? 'popup' : 'blocked' };
}

export function openPopup(url) {
  const w = Math.round(screen.availWidth * CONFIG.popupRatio);
  const feat = `popup,left=${screen.availWidth - w},top=0,width=${w},height=${screen.availHeight}`;
  try {
    if (popup && !popup.closed) { popup.location.href = url; popup.focus(); return true; }
    popup = window.open(url, 'studydesk-media', feat);
    return !!popup;
  } catch { return false; }
}

export function closeMedia(panel) {
  panel.querySelectorAll('audio,video').forEach(m => m.pause());
  panel.innerHTML = '';
  if (popup && !popup.closed) popup.close();
  popup = null;
}
