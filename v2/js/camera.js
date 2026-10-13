// ===== カメラ担当 =====
// ・カメラの起動／切替
// ・ピント（オートフォーカス／手動ピント）とズームの操作（カメラが対応している場合のみ）
// ・ピントが合っているかの判定（シャープネス計測）
// ・OCR用の静止画の切り出し

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.track = null;
    this._work = document.createElement('canvas');
    this._workCtx = this._work.getContext('2d', { willReadFrequently: true });
  }

  async listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput');
  }

  async start(deviceId) {
    this.stop();
    // できるだけ高解像度で。対応していなければブラウザが近い値に落とす
    const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const video = deviceId ? { ...base, deviceId: { exact: deviceId } } : base;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      // 前回のカメラが抜かれていた等 → 既定のカメラで再挑戦
      if (!deviceId) throw e;
      this.stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    }
    this.track = this.stream.getVideoTracks()[0];
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    await new Promise(r => (this.video.readyState >= 2 ? r() : (this.video.onloadeddata = () => r())));

    // オートフォーカスに対応していれば「常にピント合わせ」にする
    if (this.supportsFocusMode('continuous')) {
      await this.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    return this.info();
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.track = null;
  }

  get ready() { return this.video.readyState >= 2 && this.video.videoWidth > 0; }

  capabilities() { return this.track?.getCapabilities?.() || {}; }
  settings() { return this.track?.getSettings?.() || {}; }

  info() {
    const s = this.settings();
    const c = this.capabilities();
    return {
      label: this.track?.label || '',
      deviceId: s.deviceId,
      width: this.video.videoWidth,
      height: this.video.videoHeight,
      focusModes: c.focusMode || [],
      focusDistance: c.focusDistance || null, // {min,max,step}
      zoom: c.zoom || null,                   // {min,max,step}
    };
  }

  supportsFocusMode(mode) { return (this.capabilities().focusMode || []).includes(mode); }

  async setAutoFocus() {
    if (!this.supportsFocusMode('continuous')) return false;
    await this.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    return true;
  }

  async setManualFocus(distance) {
    await this.track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: Number(distance) }] });
  }

  async setZoom(value) {
    await this.track.applyConstraints({ advanced: [{ zoom: Number(value) }] });
  }

  // ピントの合い具合を数値化（ラプラシアン分散）。画面中央だけを小さくして計算するので軽い
  sharpness() {
    if (!this.ready) return 0;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const cw = vw * 0.5, ch = vh * 0.5;
    const W = 240, H = Math.round(W * ch / cw);
    this._work.width = W; this._work.height = H;
    this._workCtx.drawImage(this.video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H);
    const d = this._workCtx.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const lap = g[i - W] + g[i + W] + g[i - 1] + g[i + 1] - 4 * g[i];
        sum += lap; sum2 += lap * lap; n++;
      }
    }
    const mean = sum / n;
    return sum2 / n - mean * mean;
  }

  // 今の映像を静止画（canvas）として切り出す。maxEdgeで長辺を縮小
  capture(maxEdge = Infinity) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const scale = Math.min(1, maxEdge / Math.max(vw, vh));
    const c = document.createElement('canvas');
    c.width = Math.round(vw * scale);
    c.height = Math.round(vh * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.video, 0, 0, c.width, c.height);
    return c;
  }
}
