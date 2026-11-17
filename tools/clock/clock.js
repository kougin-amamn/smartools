/* 時計の表示の切り替え(アナログ・デジタル)。描くのは analog-clock.js と digital-clock.js。
   ?mode=digital で開ける(前のデジタル時計のページからの引き継ぎ)。選んだ表示は端末に残す */
(function () {
  'use strict';
  var KEY = 'clock-mode',
    MODES = ['analog', 'digital'],
    NAMES = { analog: 'アナログ', digital: 'デジタル' };

  function savedModeOf() {
    var asked = new URLSearchParams(location.search).get('mode');
    if (MODES.indexOf(asked) >= 0) return asked;
    try {
      var saved = localStorage.getItem(KEY);
      if (MODES.indexOf(saved) >= 0) return saved;
    } catch (e) {
      log.warn('表示の切り替えを読み込めませんでした', e);
    }
    return 'analog';
  }

  function showMode(mode) {
    document.querySelectorAll('[data-mode-view]').forEach(function (el) {
      el.hidden = el.dataset.modeView !== mode;
    });
    document.querySelectorAll('#modeSeg .seg-btn').forEach(function (b) {
      var on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // デジタルの文字の大きさは画面の幅で決めるので、見えるようにしてから測り直させる
    window.dispatchEvent(new Event('resize'));
  }

  var mode = savedModeOf();
  showMode(mode);
  document.getElementById('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    showMode(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch (err) {
      log.warn('表示の切り替えを保存できませんでした', err);
    }
    log('表示を切り替えました(' + NAMES[mode] + ')');
  });
  log.started(NAMES[mode]);
})();
