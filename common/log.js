/* ログの仕組み(全ページ共通。site.js より先に読む)。書き方の決まりは docs/logging.md。
   log / log.warn / log.error / log.debug(時刻付きでコンソールへ。直近の履歴はデバッグ画面を開いた時にまとめて出す)・
   log.step(時間のかかる処理の結果と所要時間)・log.started(起動のログ。呼ばないページは自動で出す)。押下の自動ログもこのファイル(後半) */
(function () {
  'use strict';
  /* メッセージの一覧
     このファイルが出す文言はすべてここにある。{…} の所に format() で値を入れる */
  var MSG = Object.freeze({
    detail: ' [詳細] {詳細}',
    replay: '--- ここまでの履歴 ---',
    uncaught: '予期しないエラーが発生しました',
    unhandled: '未処理の非同期エラーが発生しました',
    stepDone: '{名前}が終わりました({時間}ms)',
    stepDoneWith: '{名前}が終わりました({詳細} / {時間}ms)',
    stepError: '{名前}でエラーが発生しました',
    started: '起動しました({時間}ms)',
    startedWith: '起動しました({詳細} / {時間}ms)',
  });
  /* 文言の {キー} を値で埋める。値の無いキーは空にする */
  function format(text, vals) {
    return text.replace(/\{([^{}]+)\}/g, function (m, k) {
      return vals && vals[k] != null ? String(vals[k]) : '';
    });
  }

  /* ログの本体 */
  var MAX = 500,
    buf = [],
    replayed = false;
  function pad(n, w) {
    return String(n).padStart(w || 2, '0');
  }
  function stamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds()) +
      '.' +
      pad(d.getMilliseconds(), 3)
    );
  }
  function detailOf(e) {
    if (e instanceof Error) return (e.name && e.name !== 'Error' ? e.name + ': ' : '') + e.message;
    if (e && typeof e === 'object') {
      try {
        return JSON.stringify(e);
      } catch (x) {
        return String(e);
      }
    }
    return String(e);
  }
  function emit(level, msg, err) {
    var line =
      stamp() + ' ' + msg + (err !== undefined ? format(MSG.detail, { 詳細: detailOf(err) }) : '');
    var extra = err instanceof Error ? err : undefined;
    if (!replayed) {
      buf.push([level, line, extra]);
      if (buf.length > MAX) buf.shift();
    }
    var f = console[level] || console.log;
    if (extra) f.call(console, line, extra);
    else f.call(console, line);
  }
  function log(msg) {
    emit('info', msg);
  }
  log.info = log;
  log.debug = function (m) {
    emit('debug', m);
  };
  log.warn = function (m, e) {
    emit('warn', m, e);
  };
  log.error = function (m, e) {
    emit('error', m, e);
  };
  log.MSG = MSG;
  log.format = format;
  window.log = log;
  /* デバッグ画面(eruda)は初期化後のログしか拾わないため、開く前の履歴は開いた時にまとめて表示する */
  window.__logReplay = function () {
    replayed = true;
    console.info(MSG.replay);
    buf.forEach(function (r) {
      var f = console[r[0]] || console.log;
      if (r[2]) f.call(console, r[1], r[2]);
      else f.call(console, r[1]);
    });
    buf = [];
  };
  window.addEventListener('error', function (e) {
    log.error(
      MSG.uncaught,
      e.error ||
        (e.message || '') +
          (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''),
    );
  });
  window.addEventListener('unhandledrejection', function (e) {
    log.error(MSG.unhandled, e.reason);
  });

  /* 時間のかかる処理(成功・失敗・かかった時間を1行で)
     var r=await log.step('文字認識',function(){return worker.recognize(img);},function(v){return v.data.text.length+'文字';});
     成功 → 「文字認識が終わりました(120文字 / 1420ms)」 r={ok:true,value}
     失敗 → 「文字認識でエラーが発生しました [詳細] …」  r={ok:false,error} */
  log.step = function (name, fn, detail) {
    var t0 = performance.now();
    return Promise.resolve()
      .then(fn)
      .then(
        function (v) {
          var d = detail ? detail(v) : '',
            ms = Math.round(performance.now() - t0);
          log(format(d ? MSG.stepDoneWith : MSG.stepDone, { 名前: name, 詳細: d, 時間: ms }));
          return { ok: true, value: v };
        },
        function (e) {
          log.error(format(MSG.stepError, { 名前: name }), e);
          return { ok: false, error: e };
        },
      );
  };

  /* 起動のログ(ページを開いてから1回だけ。時間はページを開き始めてから)
     log.started('音色 ピアノ') → 「起動しました(音色 ピアノ / 180ms)」
     呼ばないページは、読み込みが終わった時に「起動しました(180ms)」を自動で出す。
     読み込みの後で準備が終わるページは、先に log.started.later() を呼び、準備ができた時に log.started(…) を呼ぶ */
  var startState = 'auto'; // auto: 自動で出す / later: 後でページが出す / done: 出した
  log.started = function (detail) {
    if (startState === 'done') return;
    startState = 'done';
    log(
      format(detail ? MSG.startedWith : MSG.started, {
        詳細: detail,
        時間: Math.round(performance.now()),
      }),
    );
  };
  log.started.later = function () {
    if (startState === 'auto') startState = 'later';
  };
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (startState === 'auto') log.started();
    }, 0);
  });
})();

/* 押下の自動ログ(後半。前半の log() を呼ぶだけで、本体の中には触れない)。ボタン・リンク・data-log を付けた要素を人が押した時、
   部品の名前から「…を押下しました」を log() で書く。値の変更や選択(select・チェック・スライダー・色・ファイル・文字入力)は出さない */
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
