/* 呼び出す画面の共通部品(本棚・ミュージアム・デスクトップのランチャーで共用)。
   一覧データの読み込み・ツールのリンクとアイコン・開いた回数の記録・読み込み中の表示。window.Launcher。
   3D の共通の計算は launcher-3d/launcher-3d-core.js(ES モジュール) */
(function (root) {
  'use strict';
  /* どのランチャーも一覧を読んでから準備が終わるので、起動のログは各ランチャーが出す */
  if (root.log && root.log.started) root.log.started.later();
  /* 置き場所
     サイトの一番上に index-data.json(ツールの一覧)、tools/<slug>/ にツール、launchers/ にこの画面がある。
     一覧の href・icon を省いた時は tools/<slug>/ を指す。書いた時は「サイトの一番上から」の相対パス(http や data: で始まるものはそのまま) */
  var ROOT = '../',
    DATA = 'index-data.json';
  function fromRoot(p) {
    return /^(https?:|data:|\/)/.test(p) ? p : ROOT + p;
  }

  /* 一覧データ(JSON)
     JSON はブラウザの制限で file:// では読めないため、https か http://127.0.0.1 のローカルサーバーで開く */
  function loadList(url) {
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + DATA);
        return r.json();
      })
      .then(function (d) {
        if (!Array.isArray(d)) throw new Error(DATA + ' の中身が配列ではありません');
        return d.filter(function (t) {
          return t && t.slug;
        });
      });
  }
  /* 一覧を読む。成功 → {list, src}。失敗 → reject(Error)。読めなかった時の説明は loadErrorMessage() */
  function loadTools() {
    var t0 = performance.now();
    return loadList(ROOT + DATA).then(function (list) {
      log(
        '一覧データを読み込みました(' +
          DATA +
          ' / ' +
          list.length +
          '件 / ' +
          Math.round(performance.now() - t0) +
          'ms)',
      );
      return { list: list, src: DATA };
    });
  }
  function loadErrorMessage() {
    return location.protocol === 'file:'
      ? 'ツールの一覧(index-data.json)を読み込めませんでした。file:// で開いたページでは読めないため、https で配信したページ(または http://127.0.0.1 のローカルサーバー)で開いてください'
      : 'ツールの一覧(index-data.json)を読み込めませんでした。サイトの一番上に index-data.json があるか確認してください';
  }
  /* 一覧を読んで main(list, source, loadMsg, loadErr) を呼ぶ(各画面の入口で使う) */
  function run(main) {
    loadTools().then(
      function (r) {
        main(r.list, r.src);
      },
      function (e) {
        main(null, '', loadErrorMessage(), e);
      },
    );
  }

  /* ツールのリンク・アイコン・名前 */
  function hrefOf(t) {
    return t.href ? fromRoot(t.href) : ROOT + 'tools/' + t.slug + '/' + t.slug + '.html';
  }
  function iconOf(t) {
    return t.icon ? fromRoot(t.icon) : ROOT + 'tools/' + t.slug + '/app-icon-' + t.slug + '.svg';
  }
  function markOf(t) {
    return t.mark || String(t.title || t.slug || '?').charAt(0);
  }
  /* 一覧の小さなアイコン: SVG を表示し、読めない時は頭文字にする */
  function markEl(t) {
    var mk = document.createElement('span'),
      img = document.createElement('img');
    mk.className = 'mk';
    img.alt = '';
    img.src = iconOf(t);
    img.onerror = function () {
      mk.textContent = markOf(t);
    };
    mk.appendChild(img);
    return mk;
  }
  function nameOf(t) {
    return t.title || t.slug;
  }

  /* 開いた回数(全モード共通。localStorage 'launcher-usage') */
  var USAGE_KEY = 'launcher-usage',
    usageCache = null;
  function usageAll() {
    if (usageCache) return usageCache;
    try {
      usageCache = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}') || {};
    } catch (e) {
      log.warn('開いた回数の読み込みに失敗しました(記録なしとして扱います)', e);
      usageCache = {};
    }
    return usageCache;
  }
  function usageCount(slug) {
    var u = usageAll();
    u[slug] = (u[slug] || 0) + 1;
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(u));
    } catch (e) {
      log.warn('開いた回数の保存に失敗しました', e);
    }
    return u[slug];
  }
  /* ツールを開く(回数を記録してから移動)。newTab=true なら別のタブで開く */
  function openTool(t, how, newTab) {
    var href = hrefOf(t),
      n = usageCount(t.slug);
    log(
      '「' +
        nameOf(t) +
        '」を' +
        (newTab ? '別のタブで' : '') +
        '開きます(' +
        href +
        ' / ' +
        n +
        '回目' +
        (how ? ' / ' + how : '') +
        ')',
    );
    if (newTab) window.open(href, '_blank', 'noopener');
    else location.href = href;
  }

  /* 読み込み中の表示 */
  var LD_T0 = performance.now();
  function loading(pct, text) {
    var bar = document.getElementById('ldBar'),
      st = document.getElementById('ldStep');
    if (bar) bar.style.width = pct + '%';
    if (st && text) st.textContent = text;
    if (text) log.debug('読み込み中: ' + text + '(' + pct + '%)');
  }
  function loadingDone() {
    var el = document.getElementById('loading');
    if (el && !el.classList.contains('done')) {
      el.classList.add('done');
      setTimeout(function () {
        el.hidden = true;
      }, 450);
      log(
        '表示の準備ができました(読み込み開始から ' + Math.round(performance.now() - LD_T0) + 'ms)',
      );
    }
  }
  /* 次の画面更新のあとに続ける(読み込み中の表示を先に画面へ出すため) */
  function next(fn) {
    requestAnimationFrame(function () {
      setTimeout(fn, 0);
    });
  }

  /* 必要な部品(グローバル名 → ファイル名)がそろっているか。足りない時はファイル名の一覧を返す(空ならそろっている) */
  function missingParts(need) {
    var out = (window.__missing || []).slice();
    Object.keys(need).forEach(function (g) {
      if (!window[g] && out.indexOf(need[g]) < 0) out.push(need[g]);
    });
    return out;
  }
  /* 足りないファイル名を読み込み中の表示に出す(一覧の表示もできない時) */
  function showMissing(files) {
    var msg = missingMessage(files),
      ld = document.getElementById('loading'),
      st = document.getElementById('ldStep');
    log.error(msg);
    if (st) st.textContent = msg;
    if (ld) ld.classList.add('err');
  }
  function missingMessage(files) {
    return (
      '表示に必要なファイル(' +
      files.join('、') +
      ')を読み込めませんでした。サーバーにファイルが置かれているか、名前が合っているか確認してください'
    );
  }

  /* ES モジュールのランチャーで、入口の import() が失敗した時(自分のファイルが置かれていない等)の表示 */
  function showModuleError(err) {
    var msg =
      '表示に必要なファイルを読み込めませんでした(' +
      ((err && err.message) || err) +
      ')。サーバーにファイルが置かれているか、名前が合っているか確認してください';
    log.error(msg, err);
    var ld = document.getElementById('loading'),
      st = document.getElementById('ldStep');
    if (st) st.textContent = msg;
    if (ld) ld.classList.add('err');
  }

  /* ツールの「戻る」ボタンの行き先として、開いているランチャーを覚える(?embed=1 の埋め込みは除く) */
  if (typeof document !== 'undefined')
    try {
      if (!/[?&]embed=1/.test(location.search)) {
        var h1 = document.querySelector('.site-bar h1');
        localStorage.setItem(
          'launcher-return',
          JSON.stringify({
            href: location.href.split('#')[0],
            title: h1 ? h1.firstChild.textContent.trim() : document.title,
          }),
        );
      }
    } catch (e) {
      log.debug('戻り先のランチャーを保存できませんでした');
    }

  var api = {
    missingParts: missingParts,
    missingMessage: missingMessage,
    showMissing: showMissing,
    showModuleError: showModuleError,
    DATA: DATA,
    fromRoot: fromRoot,
    loadTools: loadTools,
    loadErrorMessage: loadErrorMessage,
    run: run,
    hrefOf: hrefOf,
    iconOf: iconOf,
    markOf: markOf,
    markEl: markEl,
    nameOf: nameOf,
    usage: { all: usageAll, count: usageCount },
    openTool: openTool,
    loading: loading,
    loadingDone: loadingDone,
    next: next,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.Launcher = api;
  }
})(this);
