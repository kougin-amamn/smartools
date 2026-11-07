/* メトロノームの画面と音。テンポの計算は metronome-core.js */
(function () {
  const bpmNum = document.getElementById('bpmNum');
  const bpmSlider = document.getElementById('bpmSlider');
  const bpmUp = document.getElementById('bpmUp');
  const bpmDown = document.getElementById('bpmDown');
  const tapBtn = document.getElementById('tapBtn');
  const beatsSelect = document.getElementById('beatsSelect');
  const startStopBtn = document.getElementById('startStopBtn');
  const beatDots = document.getElementById('beatDots');

  let bpm = 120;
  let beatsPerMeasure = 4;
  let running = false;
  let audioCtx = null;
  let currentBeat = 0;
  let nextNoteTime = 0;
  let schedulerId = null;
  const LOOKAHEAD = 25; // ms
  const SCHEDULE_AHEAD = 0.1; // 秒

  let tapTimes = [];
  const M = window.MetronomeCore;

  function renderDots() {
    beatDots.innerHTML = '';
    for (let i = 0; i < beatsPerMeasure; i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i === 0 ? ' accent' : '');
      beatDots.appendChild(d);
    }
  }

  function flashBeat(beat) {
    [...beatDots.children].forEach((d, i) => d.classList.toggle('active', i === beat));
    setTimeout(() => {
      [...beatDots.children].forEach((d) => d.classList.remove('active'));
    }, 100);
  }

  function scheduleClick(beat, time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = beat === 0 ? 1400 : 900;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.exponentialRampToValueAtTime(beat === 0 ? 0.5 : 0.32, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.06);

    const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
    setTimeout(() => flashBeat(beat), delayMs);
  }

  function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      scheduleClick(currentBeat, nextNoteTime);
      nextNoteTime += 60 / bpm;
      currentBeat = (currentBeat + 1) % beatsPerMeasure;
    }
    schedulerId = setTimeout(scheduler, LOOKAHEAD);
  }

  function start() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        log.error('このブラウザは音の再生(Web Audio)に対応していません');
        return;
      }
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended')
      audioCtx.resume().catch((e) => log.warn('音の再生を再開できませんでした', e));
    running = true;
    currentBeat = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;
    scheduler();
    startStopBtn.textContent = '停止';
    ToolKit.vibrate();
    log(`開始しました(${bpm} BPM / ${beatsPerMeasure}拍子)`);
  }

  function stop() {
    running = false;
    clearTimeout(schedulerId);
    [...beatDots.children].forEach((d) => d.classList.remove('active'));
    startStopBtn.textContent = '開始';
    ToolKit.vibrate();
    log(`停止しました(${bpm} BPM)`);
  }

  function setBpm(v) {
    bpm = M.clampBpm(v);
    bpmNum.textContent = bpm;
    bpmSlider.value = bpm;
  }

  bpmSlider.addEventListener('input', () => setBpm(bpmSlider.value));
  bpmUp.addEventListener('click', () => {
    ToolKit.vibrate();
    const b = bpm;
    setBpm(bpm + 1);
    if (bpm === b) log.warn(`テンポは上限のため変更できませんでした(${M.MAX} BPM)`);
    else log(`テンポを ${bpm} BPM にしました`);
  });
  bpmDown.addEventListener('click', () => {
    ToolKit.vibrate();
    const b = bpm;
    setBpm(bpm - 1);
    if (bpm === b) log.warn(`テンポは下限のため変更できませんでした(${M.MIN} BPM)`);
    else log(`テンポを ${bpm} BPM にしました`);
  });

  beatsSelect.addEventListener('change', () => {
    beatsPerMeasure = parseInt(beatsSelect.value, 10);
    currentBeat = 0;
    renderDots();
  });

  tapBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const now = Date.now();
    tapTimes.push(now);
    const r = M.tapBpm(tapTimes, now);
    tapTimes = r.times;
    if (r.bpm !== null) {
      setBpm(r.bpm);
      log(`タップでテンポを ${bpm} BPM にしました(${tapTimes.length}回)`);
    }
  });

  startStopBtn.addEventListener('click', () => {
    running ? stop() : start();
  });

  renderDots();
  setBpm(120);
  log.started('120 BPM / 4拍子');
})();
