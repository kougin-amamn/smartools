/* 前のデジタル時計のブックマークや共有リンクを、時計のデジタル表示へ引き継ぐ */
(function () {
  const target = new URL('../clock/clock.html', window.location.href);
  target.search = window.location.search;
  target.searchParams.set('mode', 'digital');
  target.hash = window.location.hash;
  window.location.replace(target.href);
})();
