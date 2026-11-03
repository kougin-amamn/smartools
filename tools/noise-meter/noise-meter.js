/* 騒音計の画面。マイクの音量から dB を出す(計算は noise-meter-core.js) */
(function () {
  const dbNum = document.getElementById('dbNum');
  const gaugeFill = document.getElementById('gaugeFill');
  const minVal = document.getElementById('minVal');
  const avgVal = document.getElementById('avgVal');
  const maxVal = document.getElementById('maxVal');
  const statusText = document.getElementById('statusText');
  const startStopBtn = document.getElementById('startStopBtn');
  const resetBtn = document.getElementById('resetBtn');

  const GAUGE_MIN = 20,
    GAUGE_MAX = 100;

  let audioCtx = null,
    analyser = null,
    stream = null,
    rafId = null;
  let running = false;
  const N = window.NoiseMeterCore,
    S = N.stats(),
    st = S.state,
    fmt = N.fmt;

  function render(db) {
    dbNum.textContent = fmt(db);
    const pct = Math.max(0, Math.min(100, ((db - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100));
    gaugeFill.style.width = pct + '%';
    minVal.textContent = fmt(st.min);
    avgVal.textContent = fmt(S.avg());
    maxVal.textContent = fmt(st.max);
  }

  function loop() {
    if (!running) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    const db = N.levelDb(data);
    S.add(db);
    render(db);
    rafId = requestAnimationFrame(loop);
  }

  async function start() {
    const r = await ToolKit.media.open({ audio: true }, 'マイク');
    if (!r.stream) {
      statusText.textContent = r.message;
      return;
    }
    stream = r.stream;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    running = true;
    startStopBtn.textContent = '停止';
    statusText.textContent = '計測中…';
    ToolKit.vibrate();
    loop();
    log(`計測を開始しました(${audioCtx.sampleRate}Hz)`);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    ToolKit.media.stop(stream);
    if (audioCtx) audioCtx.close().catch((e) => log.warn('音声処理の終了に失敗しました', e));
    stream = null;
    audioCtx = null;
    analyser = null;
    startStopBtn.textContent = '開始';
    statusText.textContent = '停止しました';
    ToolKit.vibrate();
    log(
      `計測を停止しました(最小 ${fmt(st.min)} / 平均 ${fmt(S.avg())} / 最大 ${fmt(st.max)} / ${st.count}回)`
    );
  }

  function reset() {
    S.reset();
    render(NaN);
    log('リセットしました');
  }

  startStopBtn.addEventListener('click', () => {
    running ? stop() : start().catch((e) => log.error('計測の開始でエラーが発生しました', e));
  });
  resetBtn.addEventListener('click', () => {
    reset();
  });
  log('起動しました(https ' + (window.isSecureContext ? 'あり' : 'なし') + ')');
})();
