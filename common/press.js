/* 押した時の波紋(M3 の ripple)。ボタン・一覧のカード・押す札に、押した所から広がる丸い波を自動で付ける。
   site.js が読む(HTML には書かない)。外す時は要素か親に data-no-ripple。設計: docs/design/m3-expressive.md */
(function () {
  'use strict';
  var TARGETS = 'button, a.card, a.pill, label.pill, .chip, [role="button"], summary';
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');

  /* iPhone の Safari は、触った時の見た目(:active)を、触る処理が1つも無いページでは出さないため */
  document.addEventListener('touchstart', function () {}, { passive: true });

  function targetOf(e) {
    var el = e.target && e.target.closest && e.target.closest(TARGETS);
    if (!el || el.disabled || el.closest('[data-no-ripple]')) return null;
    return el;
  }

  /* 波の入れ物: 押した要素と同じ角の丸さで、はみ出した波を切る。要素の中身の並びは変えない */
  function containerOf(el) {
    var box = el.querySelector(':scope > .ripple-box');
    if (box) return box;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    box = document.createElement('span');
    box.className = 'ripple-box';
    box.setAttribute('aria-hidden', 'true');
    el.appendChild(box);
    return box;
  }

  function startRipple(e) {
    if (e.button > 0) return; // 右クリックなどは出さない
    var el = targetOf(e);
    if (!el) return;
    var rect = el.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y)),
      wave = document.createElement('span');
    wave.className = 'ripple';
    wave.style.width = wave.style.height = radius * 2 + 'px';
    wave.style.left = x - radius + 'px';
    wave.style.top = y - radius + 'px';
    containerOf(el).appendChild(wave);
    var reduced = reduceMotion && reduceMotion.matches,
      grow = reduced
        ? null
        : wave.animate([{ transform: 'scale(0.2)' }, { transform: 'scale(1)' }], {
            duration: 450,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'forwards',
          }),
      started = performance.now();

    /* 離した時に消す。さっと叩いた時も見えるよう、出てから 225ms は残す */
    function release() {
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      var wait = Math.max(0, 225 - (performance.now() - started));
      setTimeout(function () {
        var fade = wave.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 300,
          fill: 'forwards',
        });
        fade.onfinish = function () {
          if (grow) grow.cancel();
          wave.remove();
        };
      }, wait);
    }
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  }
  document.addEventListener('pointerdown', startRipple, { passive: true });
})();
