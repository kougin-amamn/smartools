/* ログの仕組み(全ページ共通。site.js より先に読む)。書き方の決まりは docs/logging.md。
   log / log.warn / log.error / log.debug(時刻付きでコンソールへ。直近の履歴はデバッグ画面を開いた時にまとめて出す)・
   log.step(時間のかかる処理の結果と所要時間)・操作の自動ログ(部品の名前から「…を押下しました」などを書く) */
(function () {
  'use strict';
  /* メッセージの一覧
     このファイルが出す文言はすべてここにある。{…} の所に fmt() で値を入れる。
     {グループ} には data-log-group がある時だけ「録音 3」の が入り、無い時は空になる */
  var MSG = Object.freeze({
    detail: ' [詳細] {詳細}',
    replay: '--- ここまでの履歴 ---',
    uncaught: '予期しないエラーが発生しました',
    unhandled: '未処理の非同期エラーが発生しました',
    stepDone: '{名前}が終わりました({時間}ms)',
    stepDoneWith: '{名前}が終わりました({詳細} / {時間}ms)',
    stepError: '{名前}でエラーが発生しました',
    group: '「{グループ名}」の',
    pressButton: '{グループ}「{名前}」ボタンを押下しました',
    pressLink: '{グループ}「{名前}」のリンクを押下しました',
    press: '{グループ}「{名前}」を押下しました',
    select: '{グループ}「{名前}」を「{値}」にしました',
    check: '{グループ}「{名前}」を {値} にしました',
    radio: '{グループ}「{名前}」を選択しました',
    range: '{グループ}「{名前}」を {値} にしました',
    color: '{グループ}「{名前}」を {値} にしました',
    file: '{グループ}「{名前}」でファイルを選択しました({件数}件 / {大きさ})',
    fileCancel: '{グループ}「{名前}」でファイルの選択をやめました',
  });
  /* 文言の {キー} を値で埋める。値の無いキーは空にする */
  function fmt(text, vals) {
    return text.replace(/\{([^{}]+)\}/g, function (m, k) {
      return vals && vals[k] != null ? String(vals[k]) : '';
    });
  }

  /* ログの本体 */
  var MAX = 500,
    buf = [],
    replayed = false;
  function p(n, w) {
    return String(n).padStart(w || 2, '0');
  }
  function stamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      '-' +
      p(d.getMonth() + 1) +
      '-' +
      p(d.getDate()) +
      ' ' +
      p(d.getHours()) +
      ':' +
      p(d.getMinutes()) +
      ':' +
      p(d.getSeconds()) +
      '.' +
      p(d.getMilliseconds(), 3)
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
    var line = stamp() + ' ' + msg + (err !== undefined ? fmt(MSG.detail, { 詳細: detailOf(err) }) : '');
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
  log.fmt = fmt;
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
        (e.message || '') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')
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
          log(fmt(d ? MSG.stepDoneWith : MSG.stepDone, { 名前: name, 詳細: d, 時間: ms }));
          return { ok: true, value: v };
        },
        function (e) {
          log.error(fmt(MSG.stepError, { 名前: name }), e);
          return { ok: false, error: e };
        }
      );
  };

  /* 操作ログ(自動)
     ボタン・リンク・チェック・選択肢・スライダー・ファイル選択・色の操作を、部品の名前から自動でログに出す。
     名前: data-log → aria-label → <label> → title → 部品の文字。data-log="off" で出さない(子の部品も)。
     data-log-group="録音 3" を親に付けると「録音 3」の「削除」ボタン…のように前に付く。
     スライダーの値: data-log-value="#表示する要素"(その文字を使う) または data-log-unit="%"(単位) / data-log-scale="100"(倍率)。名前の無い部品は出さない。
     文字入力(テキスト・数値・テキストエリア)は対象外。プログラムから呼んだ click() は出さない(ファイル選択を開く時など) */
  function clean(t) {
    t = String(t || '')
      .replace(/\s+/g, ' ')
      .trim();
    var u = t.replace(
      /^[●■▶⏸⏹⏺]\s*(?=\S)/,
      ''
    ); /* 先頭の飾りの記号は、文字が残る時だけ外す(「● 録音開始」→「録音開始」) */
    if (u) t = u;
    return t.length > 24 ? t.slice(0, 24) + '…' : t;
  }
  function labelText(el) {
    if (el.id) {
      var l = document.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent;
    }
    var p = el.closest('label');
    if (p) {
      var c = p.cloneNode(true);
      c.querySelectorAll('input,select,textarea').forEach(function (x) {
        x.remove();
      });
      return c.textContent;
    }
    return '';
  }
  function nameOf(el) {
    var n = el.getAttribute('data-log');
    if (n) return clean(n);
    n =
      el.getAttribute('aria-label') ||
      (el.matches('input,select') ? labelText(el) : '') ||
      el.getAttribute('title') ||
      (el.matches('input,select') ? '' : el.textContent) ||
      el.getAttribute('name') ||
      '';
    return clean(n);
  }
  function groupOf(el) {
    var g = el.parentElement && el.parentElement.closest('[data-log-group]');
    return g ? fmt(MSG.group, { グループ名: clean(g.getAttribute('data-log-group')) }) : '';
  }
  function off(el) {
    return !!el.closest('[data-log="off"]');
  }
  var TEXT = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week|hidden)$/;
  document.addEventListener(
    'click',
    function (e) {
      if (!e.isTrusted) return;
      var el = e.target.closest && e.target.closest('button,[role="button"],a[href],[data-log]');
      if (!el || el.matches('input,select,textarea,option,label') || off(el) || el.disabled) return;
      var n = nameOf(el);
      if (!n) return;
      var t = el.matches('button,[role="button"]')
        ? MSG.pressButton
        : el.matches('a[href]')
          ? MSG.pressLink
          : MSG.press;
      log(fmt(t, { グループ: groupOf(el), 名前: n }));
    },
    true
  );
  document.addEventListener(
    'change',
    function (e) {
      var el = e.target;
      if (!el.matches || !el.matches('input,select') || off(el)) return;
      var type = (el.type || '').toLowerCase(),
        n = nameOf(el),
        g = groupOf(el);
      if (!n) return; /* 名前の無い部品(再生位置のスライダーなど)は出さない */
      if (el.matches('select')) {
        var o = el.options[el.selectedIndex];
        log(fmt(MSG.select, { グループ: g, 名前: n, 値: clean(o ? o.text : el.value) }));
        return;
      }
      if (TEXT.test(type)) return; /* 文字入力は対象外 */
      if (type === 'checkbox') {
        log(fmt(MSG.check, { グループ: g, 名前: n, 値: el.checked ? 'ON' : 'OFF' }));
        return;
      }
      if (type === 'radio') {
        if (el.checked) log(fmt(MSG.radio, { グループ: g, 名前: n }));
        return;
      }
      if (type === 'range') {
        var vs = el.getAttribute('data-log-value'),
          ve = vs && document.querySelector(vs);
        var sc = parseFloat(el.getAttribute('data-log-scale')),
          v = sc ? Math.round(el.value * sc) : el.value; /* data-log-scale="100": 0〜1 の値を % で出す */
        log(
          fmt(MSG.range, {
            グループ: g,
            名前: n,
            値: ve ? clean(ve.textContent) : v + (el.getAttribute('data-log-unit') || ''),
          })
        );
        return;
      }
      if (type === 'file') {
        var f = [].slice.call(el.files || []);
        if (!f.length) {
          log(fmt(MSG.fileCancel, { グループ: g, 名前: n }));
          return;
        }
        var kb =
          f.reduce(function (s, x) {
            return s + x.size;
          }, 0) / 1024;
        log(
          fmt(MSG.file, {
            グループ: g,
            名前: n,
            件数: f.length,
            大きさ: kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : Math.round(kb) + 'KB',
          })
        );
        return;
      }
      if (type === 'color') {
        log(fmt(MSG.color, { グループ: g, 名前: n, 値: el.value }));
        return;
      }
    },
    true
  );
})();
