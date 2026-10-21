// ===== 表紙カメラ：表紙が見つからなかった本を、USBカメラでパシャっと撮る =====
// 撮った写真は小さく縮めて（約20KB）ブラウザ内に保存する。
// 使うカメラは「カメラをかえる」で切り替えられ、選んだカメラを覚えておく。
import { store } from './config.js?v=4.5';

const W = 240, H = 320;   // 保存サイズ（3:4・本の形）

export async function captureCover() {
  if (!navigator.mediaDevices?.getUserMedia) { alert('このブラウザではカメラが使えません'); return null; }

  const box = document.createElement('div');
  box.className = 'cam-modal';
  box.innerHTML = `
    <div class="cam-card">
      <div class="cam-title">本の ひょうしを わくに いれてね</div>
      <div class="cam-view"><video playsinline muted></video><div class="cam-frame"></div></div>
      <div class="cam-btns">
        <button class="btn ghost" data-a="cancel">やめる</button>
        <button class="btn ghost" data-a="switch">カメラをかえる</button>
        <button class="cam-shot" data-a="shot" aria-label="とる"></button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const video = box.querySelector('video');
  let stream = null;

  async function start(deviceId) {
    stream?.getTracks().forEach(t => t.stop());
    const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: base });   // 覚えていたカメラが無い時
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const id = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
    if (id) store.set('coverCam', id);
  }

  try { await start(store.get('coverCam')); }
  catch { box.remove(); alert('カメラが使えませんでした（カメラの許可を確認してください）'); return null; }

  return new Promise(resolve => {
    const done = result => { stream?.getTracks().forEach(t => t.stop()); box.remove(); resolve(result); };
    box.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'cancel') done(null);
      if (a === 'shot') done(snap(video));
      if (a === 'switch') {
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        if (cams.length < 2) return;
        const now = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
        const i = cams.findIndex(c => c.deviceId === now);
        await start(cams[(i + 1) % cams.length].deviceId).catch(() => {});
      }
    });
  });
}

// 画面のまん中の「わく」（3:4）の部分だけ切り出して縮める
function snap(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return null;
  let h = vh * 0.9, w = h * 3 / 4;
  if (w > vw * 0.9) { w = vw * 0.9; h = w * 4 / 3; }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, W, H);
  return c.toDataURL('image/jpeg', 0.72);
}
