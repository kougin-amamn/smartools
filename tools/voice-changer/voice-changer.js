/* ボイスチェンジャーの画面と音の加工(Web Audio)。加工した声は録音できる */
(function () {
  const startBtn = document.getElementById('startBtn');
  const statusText = document.getElementById('statusText');
  const panel = document.getElementById('panel');
  const modesEl = document.getElementById('modes');
  const monitorChk = document.getElementById('monitorChk');
  const volumeSlider = document.getElementById('volumeSlider');
  const recBtn = document.getElementById('recBtn');
  const recRow = document.querySelector('.rec-row');
  const recTime = document.getElementById('recTime');
  const recordings = document.getElementById('recordings');

  let audioCtx = null;
  let micStream = null;
  let sourceNode = null;
  let outputGain = null; // 音量・モニター出力の手前
  let destNode = null; // 録音用の出力先(MediaStreamAudioDestinationNode)
  let chainNodes = []; // 現在のモードで使っているノード一覧(切替時に破棄)
  let currentMode = 'normal';
  function modeName(m) {
    const b = modesEl.querySelector(`[data-mode="${m}"]`);
    return b ? b.textContent.trim() : m;
  }

  // ディストーション曲線(MDN等で広く使われる一般的な計算式)
  function makeDistortionCurve(amount) {
    const n = 4096;
    const curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * Math.PI) / 180 / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function teardownChain() {
    chainNodes.forEach((n) => {
      try {
        n.disconnect();
      } catch (e) {
        /* 未接続(想定内) */
      }
      try {
        n.stop && n.stop();
      } catch (e) {
        /* 停止済み(想定内) */
      }
    });
    chainNodes = [];
  }

  function buildChain(mode) {
    teardownChain();
    let node = sourceNode; // チェーンの先頭(マイク入力)

    function add(n) {
      chainNodes.push(n);
      return n;
    }
    function chain(next) {
      node.connect(next);
      node = next;
    }

    if (mode === 'robot') {
      const carrier = add(audioCtx.createOscillator());
      carrier.type = 'sine';
      carrier.frequency.value = 35;
      const ring = add(audioCtx.createGain());
      ring.gain.value = 0;
      carrier.connect(ring.gain);
      carrier.start();
      chain(ring);
    } else if (mode === 'radio') {
      const band = add(audioCtx.createBiquadFilter());
      band.type = 'bandpass';
      band.frequency.value = 1200;
      band.Q.value = 1.1;
      chain(band);
      const dist = add(audioCtx.createWaveShaper());
      dist.curve = makeDistortionCurve(8);
      chain(dist);
    } else if (mode === 'megaphone') {
      const band = add(audioCtx.createBiquadFilter());
      band.type = 'bandpass';
      band.frequency.value = 1500;
      band.Q.value = 2.2;
      chain(band);
      const dist = add(audioCtx.createWaveShaper());
      dist.curve = makeDistortionCurve(28);
      chain(dist);
      const makeup = add(audioCtx.createGain());
      makeup.gain.value = 0.8;
      chain(makeup);
    } else if (mode === 'echo') {
      const delay = add(audioCtx.createDelay(1.0));
      delay.delayTime.value = 0.28;
      const feedback = add(audioCtx.createGain());
      feedback.gain.value = 0.38;
      const wetLow = add(audioCtx.createBiquadFilter());
      wetLow.type = 'lowpass';
      wetLow.frequency.value = 2600;
      node.connect(delay);
      delay.connect(wetLow);
      wetLow.connect(feedback);
      feedback.connect(delay);
      const mixOut = add(audioCtx.createGain());
      node.connect(mixOut); // ドライ音
      wetLow.connect(mixOut); // エコー音
      node = mixOut;
    } else if (mode === 'helium') {
      const hp = add(audioCtx.createBiquadFilter());
      hp.type = 'highpass';
      hp.frequency.value = 700;
      chain(hp);
      const shelf = add(audioCtx.createBiquadFilter());
      shelf.type = 'highshelf';
      shelf.frequency.value = 2200;
      shelf.gain.value = 10;
      chain(shelf);
      const carrier = add(audioCtx.createOscillator());
      carrier.type = 'sine';
      carrier.frequency.value = 110;
      const ring = add(audioCtx.createGain());
      ring.gain.value = 0.5;
      carrier.connect(ring.gain);
      carrier.start();
      chain(ring);
    } else if (mode === 'ghost') {
      const lp = add(audioCtx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      chain(lp);
      const carrier = add(audioCtx.createOscillator());
      carrier.type = 'sine';
      carrier.frequency.value = 18;
      const ring = add(audioCtx.createGain());
      ring.gain.value = 0.6;
      carrier.connect(ring.gain);
      carrier.start();
      chain(ring);
      const dist = add(audioCtx.createWaveShaper());
      dist.curve = makeDistortionCurve(6);
      chain(dist);
      const delay = add(audioCtx.createDelay(1.0));
      delay.delayTime.value = 0.35;
      const feedback = add(audioCtx.createGain());
      feedback.gain.value = 0.3;
      node.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      const mixOut = add(audioCtx.createGain());
      node.connect(mixOut);
      delay.connect(mixOut);
      node = mixOut;
    }
    // 'normal' はそのまま node = sourceNode

    node.connect(outputGain);
  }

  function setMode(mode) {
    currentMode = mode;
    [...modesEl.children].forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    if (audioCtx) buildChain(mode);
    log(`声のモードを「${modeName(mode)}」にしました${audioCtx ? '' : '(マイク開始後に反映)'}`);
  }
  modesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode');
    if (!btn) return;
    ToolKit.vibrate();
    setMode(btn.dataset.mode);
  });

  monitorChk.addEventListener('change', () => {
    if (!outputGain) return;
    try {
      outputGain.disconnect(audioCtx.destination);
    } catch (e) {
      /* 未接続(想定内) */
    }
    if (monitorChk.checked) outputGain.connect(audioCtx.destination);
  });
  volumeSlider.addEventListener('input', () => {
    if (outputGain) outputGain.gain.value = parseFloat(volumeSlider.value);
  });

  startBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    startBtn.disabled = true;
    statusText.textContent = 'マイクを準備中…';
    const r = await ToolKit.media.open(
      { audio: { echoCancellation: true, noiseSuppression: true } },
      'マイク'
    );
    if (!r.stream) {
      statusText.textContent = r.message;
      startBtn.disabled = false;
      return;
    }
    micStream = r.stream;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaStreamSource(micStream);
    outputGain = audioCtx.createGain();
    outputGain.gain.value = parseFloat(volumeSlider.value);
    destNode = audioCtx.createMediaStreamDestination();
    outputGain.connect(destNode);
    if (monitorChk.checked) outputGain.connect(audioCtx.destination);

    buildChain(currentMode);

    startBtn.hidden = true;
    panel.classList.add('show');
    statusText.textContent = 'モードを選んでください(通常は加工なしの素通しです)';
    log(
      `マイクを開始しました(モード ${modeName(currentMode)} / モニター ${monitorChk.checked ? 'ON' : 'OFF'} / ${audioCtx.sampleRate}Hz)`
    );
  });

  // 録音
  let mediaRecorder = null;
  let recChunks = [];
  let recording = false;
  let recStartedAt = 0;
  let recTimerId = null;
  let recCount = 0;

  function pickMimeType() {
    const list = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    for (const t of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }

  recBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (!destNode) {
      log.warn('マイクを開始していないため録音できませんでした');
      return;
    }
    if (recording) {
      mediaRecorder.stop();
      return;
    }
    const mimeType = pickMimeType();
    recChunks = [];
    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(destNode.stream, { mimeType })
        : new MediaRecorder(destNode.stream);
    } catch (e) {
      log.warn('この端末・ブラウザは録音に対応していません', e);
      statusText.textContent = 'この端末・ブラウザは録音に対応していません。';
      return;
    }
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      addRecordingItem(blob, mediaRecorder.mimeType || 'audio/webm');
      log(
        `録音を停止しました(${recTime.textContent || '00:00'} / ${(blob.size / 1024).toFixed(0)}KB / ${mediaRecorder.mimeType || 'audio/webm'})`
      );
      recording = false;
      recRow.classList.remove('recording');
      recBtn.textContent = '● 録音開始';
      clearInterval(recTimerId);
      recTime.textContent = '';
    };
    mediaRecorder.start();
    log(`録音を開始しました(モード ${modeName(currentMode)})`);
    recording = true;
    recRow.classList.add('recording');
    recBtn.textContent = '■ 録音停止';
    recStartedAt = Date.now();
    recTimerId = setInterval(() => {
      const s = Math.floor((Date.now() - recStartedAt) / 1000);
      recTime.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
  });

  function addRecordingItem(blob, mimeType) {
    recCount += 1;
    const url = URL.createObjectURL(blob);
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const item = document.createElement('div');
    item.className = 'rec-item';
    item.innerHTML = `<audio controls src="${url}"></audio><a href="${url}" download="voice-changer-${recCount}.${ext}">保存</a>`;
    recordings.prepend(item);
    item
      .querySelector('a')
      .addEventListener('click', () => log(`録音の保存ボタンを押下しました(${recCount}件目)`));
  }

  log('起動しました');
})();
