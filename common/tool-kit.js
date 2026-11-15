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
    function labelBack() {
      var say = window.I18n ? I18n.t : null,
        place =
          say && ret.titleKey ? say(ret.titleKey, null, ret.title) : ret.title || 'ランチャー',
        text = say ? say('site.backTo', { 名前: place }, '{名前}へ戻る') : place + 'へ戻る';
      b.setAttribute('aria-label', text);
      b.title = text;
    }
    labelBack();
    document.addEventListener('i18n-ready', labelBack);
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

  /* 文字が変わるボタン(開始 → 停止 → 再開 など)の幅をそろえる。data-texts="開始|停止|再開" の中でいちばん長い文の幅を
     最小の幅にし、押して文字が変わってもボタンが伸び縮みしないようにする。言語を読み終えた時・画面の大きさが変わった時に測り直す */
  function keepButtonWidths() {
    document.querySelectorAll('[data-texts]').forEach(function (button) {
      if (!button.parentNode) return;
      var probe = button.cloneNode(false);
      probe.removeAttribute('id');
      probe.removeAttribute('hidden');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:absolute;visibility:hidden;pointer-events:none;min-width:0;width:auto;';
      button.parentNode.appendChild(probe);
      var widest = 0;
      button.dataset.texts.split('|').forEach(function (text) {
        probe.textContent = window.I18n ? I18n.say(text) : text;
        widest = Math.max(widest, Math.ceil(probe.getBoundingClientRect().width));
      });
      probe.remove();
      if (widest) button.style.minWidth = widest + 'px';
    });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', keepButtonWidths);
  else keepButtonWidths();
  document.addEventListener('i18n-ready', keepButtonWidths);
  window.addEventListener('resize', keepButtonWidths);

  root.ToolKit = { esc: esc };

  /* 端末の機能(device.js)と、開いた記録(tool-usage.js。一覧の並べ替え用): HTML の読み込みを増やさないよう、同じフォルダからここで読む。
     document.write で書いた script は、この後の HTML(読み込み確認・ツールの js)より先に読まれて動く */
  var self = document.currentScript;
  if (self && document.readyState === 'loading')
    ['device.js', 'tool-usage.js'].forEach(function (file) {
      document.write('<script src="' + new URL(file, self.src).href + '"></' + 'script>');
    });
})(this);
