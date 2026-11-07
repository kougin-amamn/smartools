/* ツールのページ共通の部品(window.ToolKit)。文字の無害化・設定シート・ランチャーへ戻るボタン。ランチャーでは読まない。
   端末の機能(振動・コピー・カメラとマイク・ライト・センサー)は device.js にあり、最後にここから読み込む */
(function (root) {
  'use strict';
  var log = root.log || function () {};
  if (!log.warn) {
    log.warn = log.error = log.debug = function () {};
  }

  /* 文字を HTML に入れる時の無害化 */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 設定シート: ヘッダの #setBtn で #settings を開く。閉じるボタン・背景・Escape で閉じる */
  function initSettings() {
    var btn = document.getElementById('setBtn'),
      sheet = document.getElementById('settings');
    if (!btn || !sheet) return;
    var close = document.getElementById('settingsClose');
    // 埋め込み表示はヘッダが隠れるため、同じボタンを画面の右上に複製して出す
    if (document.documentElement.classList.contains('embed')) {
      var f = btn.cloneNode(true);
      f.id = 'setBtnFloat';
      f.classList.add('set-float');
      document.body.appendChild(f);
      f.addEventListener('click', toggle);
    }
    function show() {
      sheet.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (close || sheet).focus();
      log('設定を開きました');
    }
    function hide(how) {
      if (sheet.hidden) return;
      sheet.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      log('設定を閉じました' + (how ? '(' + how + ')' : ''));
    }
    function toggle() {
      if (sheet.hidden) show();
      else hide();
    }
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', toggle);
    if (close)
      close.addEventListener('click', function () {
        hide();
      });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet) hide('背景を押下');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hide('Escapeキー');
    });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initSettings);
  else initSettings();

  /* ランチャーへ戻る: ランチャーから開いた時は、ヘッダの左に戻るボタンを出す */
  function initBack() {
    var bar = document.querySelector('.site-bar');
    if (!bar || document.documentElement.classList.contains('embed')) return;
    var ret = null;
    try {
      ret = JSON.parse(localStorage.getItem('launcher-return') || 'null');
    } catch (e) {
      log.debug('戻り先のランチャーを読めませんでした');
    }
    if (!ret || !ret.href) return;
    var b = document.createElement('button');
    b.className = 'dbg-btn back-btn';
    b.id = 'backBtn';
    b.setAttribute('aria-label', (ret.title || 'ランチャー') + 'へ戻る');
    b.title = b.getAttribute('aria-label');
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    bar.insertBefore(b, bar.firstChild);
    b.addEventListener('click', function () {
      // ランチャーから来たばかりなら履歴で戻る(3Dの位置などがそのまま残る)。それ以外はランチャーを開く
      var fromIt = document.referrer && document.referrer.split('#')[0] === ret.href;
      log(
        'ランチャーへ戻ります(' + (ret.title || ret.href) + (fromIt ? ' / 履歴で戻る' : '') + ')',
      );
      if (fromIt && history.length > 1) history.back();
      else location.href = ret.href;
    });
  }
  initBack();

  root.ToolKit = { esc: esc };

  /* 端末の機能: HTML の読み込みを増やさないよう、同じフォルダの device.js をここから読む。
     document.write で書いた script は、この後の HTML(読み込み確認・ツールの js)より先に読まれて動く */
  var self = document.currentScript;
  if (self && document.readyState === 'loading')
    document.write('<script src="' + new URL('device.js', self.src).href + '"></' + 'script>');
})(this);
