/* 全ページ共通のログ・テーマ(起動時は時間帯で決め、ボタンでライト⇄ダーク)・カラーテーマ(themes.json から選び全ページで共有)・
   埋め込み表示(?embed=1)・デバッグ画面(eruda)。ページ側で編集しない */
(function () {
  'use strict';
  /* ログ */
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

  /* テーマ
     起動した時だけ時間帯で決める(18時〜6時はダーク)。ヘッダのボタンでライト⇄ダークを切り替える(保存はしない) */
  var root = document.documentElement,
    tbtn = document.getElementById('themeBtn');
  var I = {
    light:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  };
  var N = { light: 'ライト', dark: 'ダーク' };
  function night() {
    var h = new Date().getHours();
    return h >= 18 || h < 6;
  }
  function apply(t) {
    var tip = 'テーマ: ' + N[t] + '(押すと' + N[t === 'dark' ? 'light' : 'dark'] + ')';
    root.setAttribute('data-theme', t);
    if (tbtn) {
      tbtn.firstElementChild.innerHTML = I[t];
      tbtn.title = tip;
      tbtn.setAttribute('aria-label', tip);
    }
  }
  try {
    localStorage.removeItem('site-theme');
  } catch (e) {
    /* 保存領域が使えない時は消す必要もない */
  } /* 以前の3種類の切り替えで保存した値を消す */
  /* 埋め込み表示(?embed=1。ダッシュボードの中など): ヘッダを隠し、テーマは親の画面に合わせる */
  var embed = /[?&]embed=1(&|$)/.test(location.search);
  if (embed) root.classList.add('embed');
  function startTheme() {
    if (embed) {
      try {
        var pt = window.parent.document.documentElement.getAttribute('data-theme');
        if (pt === 'light' || pt === 'dark') return pt;
      } catch (e) {
        /* 親が別のサイトの時は時間帯で決める */
      }
    }
    return night() ? 'dark' : 'light';
  }
  apply(startTheme());
  if (tbtn)
    tbtn.onclick = function () {
      log('テーマボタンを押下しました');
      var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(t);
      log('テーマを「' + N[t] + '」に切り替えました');
    };

  /* カラーテーマ
     選んだ色はこの端末に保存し、同じサイトの全ページで共有する(保存がない時は site.css の標準の配色)。
     1テーマは濃い色 main と淡い色 sub の2色。ライトはヘッダ main・ボタン sub、ダークはその逆にして両方の色を使う */
  var COLOR_KEY = 'site-color',
    STANDARD = 'standard',
    colorStyle = null,
    themes = null;
  /* themes.json は site.js と同じフォルダ。ページの深さ(tools/〜、launchers/)によらず site.js の場所から求める */
  var themesUrl = new URL('themes.json', document.currentScript ? document.currentScript.src : location.href)
    .href;
  function rgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /* WCAG の相対輝度。文字色を白と黒のどちらにすると読みやすいかの判定に使う */
  function lum(h) {
    var w = [0.2126, 0.7152, 0.0722];
    return rgb(h).reduce(function (s, v, i) {
      v /= 255;
      return s + w[i] * (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    }, 0);
  }
  function textOn(h) {
    var L = lum(h);
    return 1.05 / (L + 0.05) >= (L + 0.05) / (lum('#14151c') + 0.05) ? '#ffffff' : '#14151c';
  }
  function mix(a, b, t) {
    var x = rgb(a),
      y = rgb(b);
    return (
      '#' +
      x
        .map(function (v, i) {
          return p(Math.round(v * t + y[i] * (1 - t)).toString(16));
        })
        .join('')
    );
  }
  function tokens(acc, fn, tint) {
    return (
      '--accent:' +
      acc +
      ';--accent-fg:' +
      textOn(acc) +
      ';--func:' +
      fn +
      ';--func-fg:' +
      textOn(fn) +
      ';--fn-bg:' +
      tint +
      ';'
    );
  }
  function applyColor(c) {
    if (!c || c.id === STANDARD || !c.main || !c.sub) {
      if (colorStyle) colorStyle.remove();
      colorStyle = null;
      return;
    }
    if (!colorStyle) {
      colorStyle = document.createElement('style');
      colorStyle.id = 'site-color';
      document.head.appendChild(colorStyle); /* site.css より後に置き、同じ詳細度で上書きする */
    }
    colorStyle.textContent =
      ':root{' +
      tokens(c.main, c.sub, mix(c.main, '#ffffff', 0.13)) +
      '}:root[data-theme="dark"]{' +
      tokens(c.sub, c.main, mix(c.sub, '#15161c', 0.18)) +
      '}';
  }
  function savedColor() {
    try {
      return JSON.parse(localStorage.getItem(COLOR_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }
  var color = savedColor();
  applyColor(color);
  /* 別のタブやダッシュボードに埋め込んだページも、選び直した色にそろえる */
  window.addEventListener('storage', function (e) {
    if (e.key !== COLOR_KEY) return;
    color = savedColor();
    applyColor(color);
  });

  var bar = tbtn && tbtn.closest('.site-bar'),
    cbtn = null,
    menu = null;
  function loadThemes() {
    if (themes) return Promise.resolve(themes);
    var t0 = performance.now();
    return fetch(themesUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (list) {
        themes = list;
        log(
          'カラーテーマの一覧を読み込みました(' +
            list.length +
            '件 / ' +
            Math.round(performance.now() - t0) +
            'ms)'
        );
        return list;
      });
  }
  function choose(t) {
    log('「' + t.name + '」ボタンを押下しました');
    color = { id: t.id, name: t.name, main: t.main, sub: t.sub };
    applyColor(color);
    try {
      if (t.id === STANDARD) localStorage.removeItem(COLOR_KEY);
      else localStorage.setItem(COLOR_KEY, JSON.stringify(color));
    } catch (e) {
      log.warn('カラーテーマの保存に失敗しました(このページだけ切り替えます)', e);
    }
    menu.querySelectorAll('.color-item').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.id === t.id));
    });
    log('カラーテーマを「' + t.name + '」に切り替えました');
  }
  function buildMenu(list) {
    var box = menu.querySelector('.color-list'),
      now = color ? color.id : STANDARD;
    box.textContent = '';
    list.forEach(function (t) {
      var b = document.createElement('button'),
        chip = document.createElement('span'),
        name = document.createElement('span');
      b.className = 'color-item';
      b.type = 'button';
      b.dataset.id = t.id;
      b.setAttribute('aria-pressed', String(t.id === now));
      chip.className = 'color-chip';
      chip.style.background = 'linear-gradient(135deg,' + t.main + ' 50%,' + t.sub + ' 50%)';
      name.textContent = t.no + ' ' + t.name;
      b.append(chip, name);
      b.onclick = function () {
        choose(t);
      };
      box.appendChild(b);
    });
    /* 保存済みのテーマの色が themes.json で変わっていたら、新しい色にそろえる */
    var cur =
      color &&
      list.filter(function (t) {
        return t.id === color.id;
      })[0];
    if (cur && (cur.main !== color.main || cur.sub !== color.sub)) choose(cur);
  }
  function closeMenu(why) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    cbtn.setAttribute('aria-expanded', 'false');
    log('カラーテーマの選択を閉じました' + (why ? '(' + why + ')' : ''));
  }
  function openMenu() {
    menu.style.top = bar.getBoundingClientRect().bottom + 6 + 'px';
    menu.hidden = false;
    cbtn.setAttribute('aria-expanded', 'true');
    log('カラーテーマの選択を開きました');
    loadThemes().then(
      function (list) {
        buildMenu(list);
        var sel = menu.querySelector('[aria-pressed="true"]');
        if (sel) sel.focus();
      },
      function (e) {
        menu.querySelector('.color-list').innerHTML =
          '<p class="color-msg">一覧を読み込めませんでした。https で配信したページで開いてください。</p>';
        log.warn('カラーテーマの一覧の読み込みに失敗しました', e);
      }
    );
  }
  /* ヘッダのテーマボタンの前にカラーボタンを足す(ヘッダのあるページだけ)。
     操作ログは tool-kit.js の自動ログと重ならないよう data-log="off" にしてここで書く */
  if (bar) {
    cbtn = document.createElement('button');
    cbtn.className = 'dbg-btn';
    cbtn.id = 'colorBtn';
    cbtn.type = 'button';
    cbtn.dataset.log = 'off';
    cbtn.title = 'カラーテーマ';
    cbtn.setAttribute('aria-label', 'カラーテーマ');
    cbtn.setAttribute('aria-haspopup', 'dialog');
    cbtn.setAttribute('aria-expanded', 'false');
    cbtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.3-2.9H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11.5" r=".6"/><circle cx="10" cy="7.5" r=".6"/><circle cx="15" cy="7.5" r=".6"/></svg>';
    bar.insertBefore(cbtn, tbtn);

    menu = document.createElement('div');
    menu.className = 'color-menu';
    menu.id = 'colorMenu';
    menu.hidden = true;
    menu.dataset.log = 'off';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'カラーテーマ');
    menu.innerHTML = '<p class="color-menu-title">カラーテーマ</p><div class="color-list"></div>';
    document.body.appendChild(menu);
    cbtn.setAttribute('aria-controls', menu.id);

    cbtn.onclick = function () {
      log('カラーボタンを押下しました');
      if (menu.hidden) openMenu();
      else closeMenu();
    };
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !cbtn.contains(e.target)) closeMenu('外側を押下');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) {
        closeMenu('Escapeキー');
        cbtn.focus();
      }
    });
  }

  /* デバッグ画面(eruda) */
  var dbtn = document.getElementById('dbgBtn'),
    loaded = false,
    shown = false;
  if (dbtn)
    dbtn.onclick = function () {
      log('デバッグボタンを押下しました');
      function toggle() {
        if (!window.eruda) return;
        shown = !shown;
        shown ? eruda.show() : eruda.hide();
      }
      if (loaded) {
        toggle();
        return;
      }
      var sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
      sc.onload = function () {
        eruda.init();
        if (eruda._entryBtn) eruda._entryBtn.hide();
        window.__logReplay();
        loaded = true;
        toggle();
      };
      sc.onerror = function () {
        log.error('デバッグ画面の読み込みでエラーが発生しました(通信が必要です)');
      };
      document.head.appendChild(sc);
    };

  /* 環境 */
  var u = navigator.userAgent;
  var os = /iPhone|iPad|iPod/.test(u)
    ? 'iOS'
    : /Android/.test(u)
      ? 'Android'
      : /Windows/.test(u)
        ? 'Windows'
        : /Mac/.test(u)
          ? 'macOS'
          : /Linux/.test(u)
            ? 'Linux'
            : '不明OS';
  var br = /Edg\//.test(u)
    ? 'Edge'
    : /Firefox|FxiOS/.test(u)
      ? 'Firefox'
      : /Chrome|CriOS/.test(u)
        ? 'Chrome'
        : /Safari/.test(u)
          ? 'Safari'
          : '不明ブラウザ';
  log(
    '環境を確認しました(' +
      os +
      ' ' +
      br +
      ' / ' +
      innerWidth +
      '×' +
      innerHeight +
      ' / https ' +
      (window.isSecureContext ? 'あり' : 'なし') +
      ' / 振動 ' +
      ('vibrate' in navigator ? 'あり' : 'なし') +
      ' / テーマ ' +
      N[root.getAttribute('data-theme')] +
      (embed ? '(埋め込み表示)' : '(時間帯で自動)') +
      ' / カラー ' +
      (color && color.name ? color.name : '標準') +
      ')'
  );
})();
