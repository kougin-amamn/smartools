/* ポモドーロタイマーの画面。段階の切り替えは pomodoro-timer-core.js */
(function () {
  'use strict';
  const P = window.PomodoroCore;
  const R = 96;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  const modeLabel = document.getElementById('modeLabel');
  const progressCircle = document.getElementById('progressCircle');
  const timeText = document.getElementById('timeText');
  const cycleDots = document.getElementById('cycleDots');
  const startPauseBtn = document.getElementById('startPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const resetBtn = document.getElementById('resetBtn');
  const skipBtn = document.getElementById('skipBtn');
  const statsText = document.getElementById('statsText');
  const workVal = document.getElementById('workVal');
  const shortVal = document.getElementById('shortVal');
  const longVal = document.getElementById('longVal');
  const autoStartChk = document.getElementById('autoStartChk');
  const icon_btn_primary = document.getElementById('startPauseBtn');

  progressCircle.style.strokeDasharray = `${CIRCUMFERENCE}`;

  let durations = { work: 25, short: 5, long: 15 };
  const LONG_BREAK_EVERY = P.LONG_BREAK_EVERY;

  let mode = 'work'; // work | short | long
  let totalSeconds = durations.work * 60;
  let remaining = totalSeconds;
  let endAt = null;
  let rafId = null;
  let running = false;
  let workSessionsDone = 0; // 今日の合計(統計用)
  let cycleCount = 0; // 直近の長い休憩からの作業回数

  let audioCtx = null;

  const todayStr = () => P.localDate();
  function loadStats() {
    try {
      const raw = JSON.parse(localStorage.getItem('pomodoro-stats') || '{}');
      if (raw.date === todayStr()) workSessionsDone = raw.count || 0;
    } catch (e) {
      log.warn('本日の完了数の読み込みに失敗しました(0から数えます)', e);
    }
  }
  function saveStats() {
    try {
      localStorage.setItem('pomodoro-stats', JSON.stringify({ date: todayStr(), count: workSessionsDone }));
    } catch (e) {
      log.warn('本日の完了数の保存に失敗しました', e);
    }
  }

  function isBreak() {
    return mode !== 'work';
  }

  function updateModeUI() {
    modeLabel.textContent = P.NAMES[mode];
    modeLabel.classList.toggle('break', isBreak());
    progressCircle.classList.toggle('break', isBreak());
    icon_btn_primary.classList.toggle('break', isBreak());
  }

  function renderDots() {
    cycleDots.innerHTML = '';
    for (let i = 0; i < LONG_BREAK_EVERY; i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i < cycleCount ? ' done' : '');
      cycleDots.appendChild(d);
    }
  }

  const fmt = P.formatTime;
  function hhmm(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function updateDisplay() {
    timeText.textContent = fmt(remaining);
    const fraction = totalSeconds > 0 ? remaining / totalSeconds : 0;
    progressCircle.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - fraction)}`;
    statsText.textContent = `本日の完了:${workSessionsDone} ポモドーロ`;
  }

  function setModeDuration() {
    totalSeconds = durations[mode] * 60;
    remaining = totalSeconds;
    updateDisplay();
  }

  function beep() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = mode === 'work' ? 660 : 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    o.start(now);
    o.stop(now + 0.45);
  }

  function tick() {
    if (!running) return;
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    updateDisplay();
    if (remaining <= 0) {
      onPhaseComplete();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function start(auto) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended')
        audioCtx.resume().catch((e) => log.warn('音の再生を再開できませんでした', e));
    } catch (e) {
      log.warn('この端末・ブラウザでは終了の音を鳴らせません', e);
    }
    const resumed = remaining < totalSeconds;
    running = true;
    endAt = Date.now() + remaining * 1000;
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
    setSettingsEnabled(false);
    ToolKit.vibrate();
    rafId = requestAnimationFrame(tick);
    log(
      `${P.NAMES[mode]}を${auto ? '自動で開始' : resumed ? '再開' : '開始'}しました(残り ${fmt(remaining)} / 終了予定 ${hhmm(endAt)})`
    );
  }
  function pause() {
    running = false;
    cancelAnimationFrame(rafId);
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    setSettingsEnabled(true);
    ToolKit.vibrate();
    log(`一時停止しました(${P.NAMES[mode]} / 残り ${fmt(remaining)})`);
  }
  function reset() {
    running = false;
    cancelAnimationFrame(rafId);
    setModeDuration();
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    setSettingsEnabled(true);
    ToolKit.vibrate();
    log(`リセットしました(${P.NAMES[mode]} ${fmt(remaining)})`);
  }

  function nextMode() {
    const n = P.next(mode, cycleCount);
    cycleCount = n.cycle;
    return n.mode;
  }

  function onPhaseComplete() {
    running = false;
    cancelAnimationFrame(rafId);
    ToolKit.vibrate(200);
    try {
      beep();
    } catch (e) {
      log.warn('終了の音を鳴らせませんでした', e);
    }
    const done = mode;
    if (mode === 'work') {
      workSessionsDone += 1;
      saveStats();
    }
    mode = nextMode();
    log(
      `${P.NAMES[done]}が完了しました(${P.NAMES[done]} → ${P.NAMES[mode]} / 本日 ${workSessionsDone} ポモドーロ)`
    );
    updateModeUI();
    renderDots();
    setModeDuration();
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    setSettingsEnabled(true);
    if (autoStartChk.checked) start(true);
  }

  function skip() {
    ToolKit.vibrate();
    running = false;
    cancelAnimationFrame(rafId);
    const from = mode;
    mode = nextMode();
    log(`スキップしました(${P.NAMES[from]} → ${P.NAMES[mode]})`);
    updateModeUI();
    renderDots();
    setModeDuration();
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    setSettingsEnabled(true);
  }

  function setSettingsEnabled(enabled) {
    document.querySelectorAll('.stepper').forEach((b) => {
      b.disabled = !enabled;
    });
  }

  document.querySelectorAll('.stepper').forEach((btn) => {
    btn.addEventListener('click', () => {
      ToolKit.vibrate();
      const key = btn.dataset.key;
      const delta = parseInt(btn.dataset.delta, 10);
      const r = P.step(key, durations[key], delta);
      if (!r.changed) {
        log.warn(`${P.NAMES[key]}の時間は${r.limit}のため変更できませんでした(${r.value}分)`);
        return;
      }
      durations[key] = r.value;
      document.getElementById(key + 'Val').textContent = durations[key];
      if (mode === key && !running) setModeDuration();
      log(`${P.NAMES[key]}の時間を ${durations[key]}分 にしました`);
    });
  });

  startPauseBtn.addEventListener('click', () => {
    if (running) pause();
    else start();
  });
  resetBtn.addEventListener('click', () => {
    reset();
  });
  skipBtn.addEventListener('click', () => {
    skip();
  });

  loadStats();
  updateModeUI();
  renderDots();
  setModeDuration();
  log(
    `起動しました(作業 ${durations.work}分 / 短い休憩 ${durations.short}分 / 長い休憩 ${durations.long}分 / 本日 ${workSessionsDone} ポモドーロ)`
  );
})();
