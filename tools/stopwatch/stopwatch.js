/* ストップウォッチの画面。計時は stopwatch-core.js */
(function () {
  'use strict';
  const timeText = document.getElementById('timeText');
  const startStopBtn = document.getElementById('startStopBtn');
  const lapResetBtn = document.getElementById('lapResetBtn');
  const laps = document.getElementById('laps');

  const SW = window.StopwatchCore,
    sw = SW.create(),
    fmt = SW.fmt;
  let rafId = null;

  function tick() {
    timeText.textContent = fmt(sw.current());
    if (sw.state.running) rafId = requestAnimationFrame(tick);
  }

  function start() {
    const resumed = sw.state.elapsed > 0;
    sw.start();
    startStopBtn.textContent = '停止';
    startStopBtn.classList.add('stop');
    lapResetBtn.textContent = 'ラップ';
    rafId = requestAnimationFrame(tick);
    ToolKit.vibrate();
    log(`${resumed ? '再開' : '開始'}しました(${fmt(sw.current())})`);
  }

  function stop() {
    sw.stop();
    cancelAnimationFrame(rafId);
    timeText.textContent = fmt(sw.current());
    startStopBtn.textContent = '再開';
    startStopBtn.classList.remove('stop');
    lapResetBtn.textContent = 'リセット';
    ToolKit.vibrate();
    log(`停止しました(${fmt(sw.current())} / ラップ ${sw.state.laps.length}件)`);
  }

  function reset() {
    const was = fmt(sw.current());
    sw.reset();
    timeText.textContent = fmt(0);
    laps.innerHTML = '';
    startStopBtn.textContent = '開始';
    lapResetBtn.textContent = 'ラップ';
    log(`リセットしました(${was})`);
  }

  function addLap() {
    const l = sw.lap();
    const row = document.createElement('div');
    row.className = 'lap-row';
    row.innerHTML = `<span class="lap-no">ラップ ${l.no}</span><span>${fmt(l.split)}</span><span>${fmt(l.total)}</span>`;
    laps.prepend(row);
    ToolKit.vibrate();
    log(`ラップを記録しました(ラップ ${l.no} / ${fmt(l.split)} / 合計 ${fmt(l.total)})`);
  }

  startStopBtn.addEventListener('click', () => {
    sw.state.running ? stop() : start();
  });
  lapResetBtn.addEventListener('click', () => {
    if (sw.state.running) addLap();
    else reset();
  });

  timeText.textContent = fmt(0);
  log('起動しました');
})();
