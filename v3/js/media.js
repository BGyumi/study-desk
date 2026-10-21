// ===== 右側の表示担当：YouTube・音声・動画・ページを開く =====
let tab = null;   // 教材ページ用のタブは1つだけを使い回す（タブが増えないように）

// panel に表示する。ふつうのページ（HTML）は新しいタブ。戻り値：{ opened: 'panel' | 'tab' | 'blocked' }
export function showMedia(panel, r) {
  panel.innerHTML = '';

  if (r.kind === 'youtube') {
    // 動画1本：embed/動画ID（再生リスト付きならそのまま続きも流れる）／再生リストだけ：embed/videoseries
    // rel=0：関連動画を出さない（脱線防止）、playsinline：その場で再生
    const q = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1' });
    if (r.listId) q.set('list', r.listId);
    const path = r.youtubeId ? encodeURIComponent(r.youtubeId) : 'videoseries';
    panel.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${path}?${q}"
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

  // 教材のHTMLページは埋め込みを禁止していることが多いので、新しいタブで開く
  return { opened: openTab(r.url) ? 'tab' : 'blocked' };
}

// 同じ名前のタブを使い回す：2回目以降は新しいタブが増えず、前の教材タブの中身が切り替わる
export function openTab(url) {
  try {
    tab = window.open(url, 'studydesk-media');
    if (tab) tab.focus();
    return !!tab;
  } catch { return false; }
}

// 教材タブが閉じられたか（閉じたら、こどもモードを最初の画面に戻すため）
export const tabClosed = () => !tab || tab.closed;

export function closeMedia(panel) {
  panel.querySelectorAll('audio,video').forEach(m => m.pause());
  panel.innerHTML = '';
  if (tab && !tab.closed) tab.close();
  tab = null;
}
