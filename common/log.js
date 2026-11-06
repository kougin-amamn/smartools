/* ログの仕組み(全ページ共通。site.js より先に読む)。書き方の決まりは docs/logging.md。
   log / log.warn / log.error / log.debug(時刻付きでコンソールへ。直近の履歴はデバッグ画面を開いた時にまとめて出す)・
   log.step(時間のかかる処理の結果と所要時間)・操作の自動ログ(部品の名前から「…を押下しました」などを書く) */
(function () {
  'use strict';
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
    var line = stamp() + ' ' + msg + (err !== undefined ? ' [詳細] ' + detailOf(err) : '');
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
  window.log = log;
  /* デバッグ画面(eruda)は初期化後のログしか拾わないため、開く前の履歴は開いた時にまとめて表示する */
  window.__logReplay = function () {
    replayed = true;
    console.info('--- ここまでの履歴 ---');
    buf.forEach(function (r) {
      var f = console[r[0]] || console.log;
      if (r[2]) f.call(console, r[1], r[2]);
      else f.call(console, r[1]);
    });
    buf = [];
  };
  window.addEventListener('error', function (e) {
    log.error(
      '予期しないエラーが発生しました',
      e.error ||
        (e.message || '') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')
    );
  });
  window.addEventListener('unhandledrejection', function (e) {
    log.error('未処理の非同期エラーが発生しました', e.reason);
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
          var d = detail ? detail(v) : '';
          log(name + 'が終わりました(' + (d ? d + ' / ' : '') + Math.round(performance.now() - t0) + 'ms)');
          return { ok: true, value: v };
        },
        function (e) {
          log.error(name + 'でエラーが発生しました', e);
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
    return g ? '「' + clean(g.getAttribute('data-log-group')) + '」の' : '';
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
      var kind = el.matches('button,[role="button"]') ? 'ボタン' : el.matches('a[href]') ? 'のリンク' : '';
      log(groupOf(el) + '「' + n + '」' + kind + 'を押下しました');
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
        log(g + '「' + n + '」を「' + clean(o ? o.text : el.value) + '」にしました');
        return;
      }
      if (TEXT.test(type)) return; /* 文字入力は対象外 */
      if (type === 'checkbox') {
        log(g + '「' + n + '」を ' + (el.checked ? 'ON' : 'OFF') + ' にしました');
        return;
      }
      if (type === 'radio') {
        if (el.checked) log(g + '「' + n + '」を選択しました');
        return;
      }
      if (type === 'range') {
        var vs = el.getAttribute('data-log-value'),
          ve = vs && document.querySelector(vs);
        var sc = parseFloat(el.getAttribute('data-log-scale')),
          v = sc ? Math.round(el.value * sc) : el.value; /* data-log-scale="100": 0〜1 の値を % で出す */
        log(
          g +
            '「' +
            n +
            '」を ' +
            (ve ? clean(ve.textContent) : v + (el.getAttribute('data-log-unit') || '')) +
            ' にしました'
        );
        return;
      }
      if (type === 'file') {
        var f = [].slice.call(el.files || []);
        if (!f.length) {
          log(g + '「' + n + '」でファイルの選択をやめました');
          return;
        }
        var kb =
          f.reduce(function (s, x) {
            return s + x.size;
          }, 0) / 1024;
        log(
          g +
            '「' +
            n +
            '」でファイルを選択しました(' +
            f.length +
            '件 / ' +
            (kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : Math.round(kb) + 'KB') +
            ')'
        );
        return;
      }
      if (type === 'color') {
        log(g + '「' + n + '」を ' + el.value + ' にしました');
        return;
      }
    },
    true
  );
})();
