/* 既存のブックマークや共有リンクはナイトモードへ引き継ぐ。 */
(function () {
  const target = new URL('../multi-camera/multi-camera.html', window.location.href);
  target.search = window.location.search;
  target.searchParams.set('mode', 'night');
  target.hash = window.location.hash;
  window.location.replace(target.href);
})();
