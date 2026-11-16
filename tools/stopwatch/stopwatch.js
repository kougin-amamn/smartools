/* ストップウォッチの画面。外の輪で秒の経過、内の輪で前のラップとの比べを見せる。計時は stopwatch-core.js */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const timeText = $('timeText'),
    startStopBtn = $('startStopBtn'),
    resetBtn = $('resetBtn'),
    lapBtn = $('lapBtn'),
    laps = $('laps'),
    lapsBox = $('lapsBox'),
    secondRing = $('secondRing'),
    secondHead = $('secondHead'),
    paceRing = $('paceRing'),
    paceTrack = $('paceTrack'),
    paceText = $('paceText');

  const SW = window.StopwatchCore,
    sw = SW.create(),
    fmt = SW.fmt;
  const OUTER = 2 * Math.PI * 100,
    INNER = 2 * Math.PI * 84;
  let rafId = null;
  secondRing.style.strokeDasharray = OUTER;
  paceRing.style.strokeDasharray = INNER;

  /* 秒の差を「+0.52」の形にする */
  function signedSecondsOf(ms) {
    return (ms >= 0 ? '+' : '−') + (Math.abs(ms) / 1000).toFixed(2);
  }

  function draw() {
    const ms = sw.current(),
      text = fmt(ms);
    timeText.innerHTML = `${text.slice(0, 5)}<small>${text.slice(5)}</small>`;
    const p = SW.secondProgressOf(ms),
      angle = p * 2 * Math.PI;
    secondRing.style.strokeDashoffset = OUTER * (1 - p);
    secondHead.setAttribute('cx', (110 + 100 * Math.sin(angle)).toFixed(2));
    secondHead.setAttribute('cy', (110 - 100 * Math.cos(angle)).toFixed(2));
    const list = sw.state.laps,
      pace = list.length ? SW.paceOf(ms - sw.state.lastLap, list[list.length - 1].split) : null;
    paceRing.style.display = paceTrack.style.display = pace ? '' : 'none';
    paceText.hidden = !pace;
    if (pace) {
      paceRing.style.strokeDashoffset = INNER * (1 - pace.ratio);
      paceRing.classList.toggle('over', pace.over);
      paceText.classList.toggle('over', pace.over);
      paceText.textContent = `前のラップより ${signedSecondsOf(pace.difference)}`;
    }
  }
  function tick() {
    draw();
    if (sw.state.running) rafId = requestAnimationFrame(tick);
  }

  /* 押せるボタンと絵を、動いているか・0 かに合わせる */
  function showState() {
    const running = sw.state.running;
    $('playIcon').style.display = running ? 'none' : '';
    $('pauseIcon').style.display = running ? '' : 'none';
    startStopBtn.classList.toggle('running', running);
    startStopBtn.setAttribute(
      'aria-label',
      running ? '一時停止' : sw.current() > 0 ? '再開' : '開始',
    );
    lapBtn.disabled = !running;
    resetBtn.disabled = running || sw.current() === 0;
  }

  function start() {
    const resumed = sw.state.elapsed > 0;
    sw.start();
    showState();
    rafId = requestAnimationFrame(tick);
    ToolKit.vibrate();
    log(`${resumed ? '再開' : '開始'}しました(${fmt(sw.current())})`);
  }

  function stop() {
    sw.stop();
    cancelAnimationFrame(rafId);
    draw();
    showState();
    ToolKit.vibrate();
    log(`停止しました(${fmt(sw.current())} / ラップ ${sw.state.laps.length}件)`);
  }

  function reset() {
    const was = fmt(sw.current());
    sw.reset();
    laps.innerHTML = '';
    lapsBox.hidden = true;
    draw();
    showState();
    log(`リセットしました(${was})`);
  }

  /* 最速・最遅の札を付け直す(色だけに頼らず文字の札) */
  function markExtremes() {
    const ex = SW.extremesOf(sw.state.laps);
    laps.querySelectorAll('.lap-row').forEach((row) => {
      const no = Number(row.dataset.no),
        mark = row.querySelector('.mark');
      if (mark) mark.remove();
      const kind = ex && (no === ex.fastest ? 'fastest' : no === ex.slowest ? 'slowest' : '');
      if (kind)
        row
          .querySelector('.lap-no')
          .insertAdjacentHTML(
            'beforeend',
            `<span class="mark ${kind}">${kind === 'fastest' ? '最速' : '最遅'}</span>`,
          );
    });
  }

  function addLap() {
    const l = sw.lap();
    const row = document.createElement('div');
    row.className = 'lap-row';
    row.dataset.no = l.no;
    row.innerHTML = `<span class="lap-no">${l.no}</span><span>${fmt(l.split)}</span><span>${fmt(l.total)}</span>`;
    laps.prepend(row);
    lapsBox.hidden = false;
    markExtremes();
    ToolKit.vibrate();
    log(`ラップを記録しました(ラップ ${l.no} / ${fmt(l.split)} / 合計 ${fmt(l.total)})`);
  }

  startStopBtn.addEventListener('click', () => (sw.state.running ? stop() : start()));
  lapBtn.addEventListener('click', addLap);
  resetBtn.addEventListener('click', reset);

  draw();
  showState();
})();
