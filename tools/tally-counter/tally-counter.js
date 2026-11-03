/* 数取器(0〜9999。端末の localStorage に保存) */
(function () {
  'use strict';
  var KEY = 'tally-counter-v1',
    n = 0,
    win = document.getElementById('count'),
    vib = document.getElementById('vib'),
    snd = document.getElementById('snd'),
    D = 4,
    canVib = typeof navigator.vibrate === 'function',
    ac = null;
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || '{}');
    n = Math.min(9999, Math.max(0, s.n | 0));
    if (s.vib === false) vib.checked = false;
    if (s.snd) snd.checked = true;
  } catch (e) {
    log.warn('保存したカウントの読み込みに失敗しました(0から始めます)', e);
  }
  var stored = false;
  try {
    stored = !!localStorage.getItem(KEY);
  } catch (e) {
    log.warn('保存領域を確認できませんでした', e);
  }
  if (!canVib) {
    vib.checked = false;
    vib.disabled = true;
    vib.parentNode.className += ' na';
    document.getElementById('vibTxt').textContent = '振動(この端末・ブラウザは非対応です)';
    if (!stored) snd.checked = true;
  }
  for (var i = 0; i < D; i++) {
    var d = document.createElement('div');
    d.className = 'digit';
    win.appendChild(d);
  }
  var ds = win.children;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ n: n, vib: vib.checked, snd: snd.checked }));
    } catch (e) {
      log.warn('カウントの保存に失敗しました', e);
    }
  }
  function draw() {
    var t = ('0000' + n).slice(-D);
    for (var i = 0; i < D; i++) ds[i].textContent = t[i];
    win.setAttribute('aria-label', n + '');
  }
  function click() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      var o = ac.createOscillator(),
        g = ac.createGain();
      o.type = 'square';
      o.frequency.value = 1800;
      g.gain.setValueAtTime(0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.05);
    } catch (e) {
      log.warn('クリック音を鳴らせませんでした', e);
    }
  }
  function buzz() {
    if (vib.checked && canVib) navigator.vibrate(40);
    if (snd.checked) click();
  }
  document.getElementById('plus').onclick = function () {
    var wrapped = n === 9999;
    n = (n + 1) % 10000;
    draw();
    save();
    buzz();
    if (wrapped) log.warn('9999を超えたため0に戻りました');
    else log('カウントしました(' + n + ')');
  };
  document.getElementById('reset').onclick = function () {
    if (n === 0 || confirm('カウントを0に戻しますか?')) {
      var was = n;
      n = 0;
      draw();
      save();
      log('リセットしました(' + was + ' → 0)');
    } else log('リセットをやめました(' + n + ')');
  };
  vib.onchange = function () {
    save();
    if (vib.checked && canVib) navigator.vibrate(40);
  };
  snd.onchange = function () {
    save();
    if (snd.checked) click();
  };
  draw();
  log(
    '起動しました(' +
      n +
      ' / 振動 ' +
      (vib.checked ? 'ON' : 'OFF') +
      ' / クリック音 ' +
      (snd.checked ? 'ON' : 'OFF') +
      ')'
  );
})();
