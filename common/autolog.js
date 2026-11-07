/* 押下の自動ログ(全ページ共通。log.js の後に読む)。ボタン・リンク・data-log を付けた要素を人が押した時、部品の名前から
   「…を押下しました」を log() で書く。値の変更や選択(select・チェック・スライダー・色・ファイル・文字入力)は出さない */
(function () {
  'use strict';
  if (!window.log) return;
  var log = window.log,
    format = log.format;
  /* メッセージの一覧
     {グループ} には data-log-group がある時だけ「録音 3」の が入り、無い時は空になる */
  var MSG = Object.freeze({
    group: '「{グループ名}」の',
    pressButton: '{グループ}「{名前}」ボタンを押下しました',
    pressLink: '{グループ}「{名前}」のリンクを押下しました',
    press: '{グループ}「{名前}」を押下しました',
  });

  /* 名前: data-log → aria-label → title → 部品の文字。空白をまとめ、先頭の飾りの記号は文字が残る時だけ外し、24文字で切る */
  function clean(text) {
    text = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    var plain = text.replace(/^[●■▶⏸⏹⏺]\s*(?=\S)/, '');
    if (plain) text = plain;
    return text.length > 24 ? text.slice(0, 24) + '…' : text;
  }
  function nameOf(el) {
    return clean(
      el.getAttribute('data-log') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent,
    );
  }
  function groupOf(el) {
    var g = el.parentElement && el.parentElement.closest('[data-log-group]');
    return g ? format(MSG.group, { グループ名: clean(g.getAttribute('data-log-group')) }) : '';
  }

  /* キャプチャで見張り、ページ側の結果のログより先に出す。プログラムから呼んだ click() は出さない */
  document.addEventListener(
    'click',
    function (e) {
      if (!e.isTrusted) return;
      var el = e.target.closest && e.target.closest('button,[role="button"],a[href],[data-log]');
      if (
        !el ||
        el.matches('input,select,textarea,option,label') ||
        el.closest('[data-log="off"]') ||
        el.disabled
      )
        return;
      var name = nameOf(el);
      if (!name) return;
      var text = el.matches('button,[role="button"]')
        ? MSG.pressButton
        : el.matches('a[href]')
          ? MSG.pressLink
          : MSG.press;
      log(format(text, { グループ: groupOf(el), 名前: name }));
    },
    true,
  );
})();
