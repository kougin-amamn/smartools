/* キッチンタイマーの画面。時間の計算は kitchen-timer-core.js */
function formatTime(t) {
  var s = Math.max(0, Math.round(t)),
    m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function onTap(c, sel, h) {
  c.addEventListener('click', function (e) {
    var el = e.target.closest(sel);
    if (el && c.contains(el)) h(el, e);
  });
}
(function () {
  'use strict';
  const K = window.KitchenTimerCore;
  const R = 96;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  const progressCircle = document.getElementById('progressCircle');
  const timeText = document.getElementById('timeText');
  const stateText = document.getElementById('stateText');
  const adjustRow = document.getElementById('adjustRow');
  const startPauseBtn = document.getElementById('startPauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const stopBtn = document.getElementById('stopBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');

  progressCircle.style.strokeDasharray = `${CIRCUMFERENCE}`;

  const DEFAULT_SECONDS = K.DEFAULT;
  function hhmm(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  let totalSeconds = DEFAULT_SECONDS;
  let remaining = DEFAULT_SECONDS;
  let endAt = null; // Date.now() 基準の終了時刻（running中のみ有効）
  let rafId = null;
  let mode = 'idle'; // idle | running | paused | ringing
  let audioCtx = null;
  let ringInterval = null;

  function updateRing() {
    const fraction = totalSeconds > 0 ? remaining / totalSeconds : 0;
    progressCircle.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - fraction)}`;
  }
  function updateDisplay() {
    timeText.textContent = formatTime(remaining);
    updateRing();
  }
  function setAdjustEnabled(enabled) {
    [...adjustRow.querySelectorAll('button')].forEach((b) => (b.disabled = !enabled));
  }

  function tick() {
    if (mode !== 'running') return;
    const left = Math.max(0, (endAt - Date.now()) / 1000);
    remaining = left;
    updateDisplay();
    if (left <= 0) {
      startRinging();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (remaining <= 0) {
      log.warn('時間が 00:00 のため開始できませんでした');
      return;
    }
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended')
        audioCtx.resume().catch((e) => log.warn('音の再生を再開できませんでした', e));
    } catch (e) {
      log.warn('この端末・ブラウザではアラーム音を鳴らせません', e);
    }
    const resumed = mode === 'paused';

    mode = 'running';
    endAt = Date.now() + remaining * 1000;
    stateText.textContent = '実行中';
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
    setAdjustEnabled(false);
    stopBtn.disabled = true;
    ToolKit.vibrate();
    rafId = requestAnimationFrame(tick);
    log(
      `${resumed ? '再開' : '開始'}しました(残り ${formatTime(remaining)} / 終了予定 ${hhmm(endAt)})`,
    );
  }

  function pause() {
    if (mode !== 'running') return;
    cancelAnimationFrame(rafId);
    mode = 'paused';
    stateText.textContent = '一時停止';
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    setAdjustEnabled(true);
    ToolKit.vibrate();
    log(`一時停止しました(残り ${formatTime(remaining)})`);
  }

  function reset() {
    cancelAnimationFrame(rafId);
    stopRinging();
    mode = 'idle';
    totalSeconds = DEFAULT_SECONDS;
    remaining = DEFAULT_SECONDS;
    stateText.textContent = 'セット中';
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    setAdjustEnabled(true);
    stopBtn.disabled = true;
    updateDisplay();
    ToolKit.vibrate();
    log(`リセットしました(${formatTime(remaining)})`);
  }

  function beep() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.start(now);
    o.stop(now + 0.4);
  }

  function startRinging() {
    mode = 'ringing';
    remaining = 0;
    updateDisplay();
    stateText.textContent = '時間です';
    document.body.classList.add('ringing');
    setAdjustEnabled(false);
    startPauseBtn.disabled = true;
    stopBtn.disabled = false;
    ToolKit.vibrate(200);
    const safeBeep = () => {
      try {
        beep();
      } catch (e) {
        log.warn('アラーム音を鳴らせませんでした', e);
        clearInterval(ringInterval);
      }
    };
    safeBeep();
    ringInterval = setInterval(safeBeep, 900);
    log(`時間になりました(${formatTime(totalSeconds)} / アラームを鳴らしています)`);
  }

  function stopRinging() {
    if (ringInterval) {
      clearInterval(ringInterval);
      ringInterval = null;
    }
    document.body.classList.remove('ringing');
    startPauseBtn.disabled = false;
  }

  function adjust(delta) {
    if (mode === 'running') {
      log.warn('実行中のため時間を変更できませんでした');
      return;
    }
    const r = K.adjust(totalSeconds, delta);
    if (!r.changed) {
      log.warn(`時間は${r.limit}のため変更できませんでした(${formatTime(r.value)})`);
      return;
    }
    totalSeconds = r.value;
    remaining = totalSeconds;
    updateDisplay();
    log(`時間を ${formatTime(totalSeconds)} にしました`);
  }

  onTap(adjustRow, 'button', (btn) => {
    ToolKit.vibrate();
    const d = parseInt(btn.dataset.adjust, 10);
    adjust(d);
  });

  startPauseBtn.addEventListener('click', () => {
    if (mode === 'idle' || mode === 'paused') start();
    else if (mode === 'running') pause();
  });

  resetBtn.addEventListener('click', () => {
    reset();
  });

  stopBtn.addEventListener('click', () => {
    if (mode === 'ringing') {
      log('アラームを止めました');
      reset();
    }
  });

  updateDisplay();
  log.started(formatTime(remaining));
})();
