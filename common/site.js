/* 全ページ共通のテーマ(起動時は時間帯で決め、ボタンでライト⇄ダーク)・カラーテーマ(themes.json から選び全ページで共有)・
   環境情報・埋め込み表示(?embed=1)・デバッグ画面(eruda)。ログは log.js(先に読む)。ページ側で編集しない */
(function () {
  'use strict';
  /* ログは log.js が用意する。読めなかった時も画面が動くよう、何もしないログで代わりにする */
  var log = window.log;
  if (!log) {
    log = function () {};
    log.info = log.warn = log.error = log.debug = log;
  }

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
  /* 埋め込み表示(?embed=1。他のページに埋め込んだ時): ヘッダを隠し、テーマは親の画面に合わせる */
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
  /* 押下のログは log.js の自動ログに任せる(文字が状態で変わるので名前を固定する) */
  if (tbtn) tbtn.setAttribute('data-log', 'テーマ');
  if (tbtn)
    tbtn.onclick = function () {
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
  /* 別のタブや埋め込んだページも、選び直した色にそろえる */
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
    log('「カラーテーマ」の「' + t.name + '」ボタンを押下しました');
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
     ボタンの押下は log.js の自動ログ、色の一覧は並びが特殊なので自動ログを止めてここで書く */
  if (bar) {
    cbtn = document.createElement('button');
    cbtn.className = 'dbg-btn';
    cbtn.id = 'colorBtn';
    cbtn.type = 'button';
    cbtn.dataset.log = 'カラーテーマ';
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

  /* 環境情報
     ヘッダの「i」ボタンで、この端末・ブラウザの情報を表示する(端末の外には送らない)。開くたびに最新の値を読み直す */
  var ibtn = null,
    imenu = null;
  function yesNo(v) {
    return v ? 'あり' : 'なし';
  }
  function canStore() {
    try {
      localStorage.setItem('site-probe', '1');
      localStorage.removeItem('site-probe');
      return true;
    } catch (e) {
      return false;
    }
  }
  function envRows() {
    var tz = '';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      tz = '不明';
    }
    var net = navigator.connection && navigator.connection.effectiveType;
    return [
      ['OS', os + (osVer ? ' ' + osVer : '')],
      ['ブラウザ', br],
      ['画面(縦×横)', screen.height + '×' + screen.width + 'px'],
      ['画面の倍率', String(window.devicePixelRatio || 1)],
      ['表示領域(縦×横)', innerHeight + '×' + innerWidth + 'px'],
      ['向き', innerWidth > innerHeight ? '横向き' : '縦向き'],
      ['https', yesNo(window.isSecureContext)],
      ['通信', (navigator.onLine ? 'オンライン' : 'オフライン') + (net ? '(' + net + ')' : '')],
      ['言語', navigator.language || '不明'],
      ['タイムゾーン', tz || '不明'],
      ['振動', yesNo('vibrate' in navigator)],
      ['保存領域', canStore() ? '使える' : '使えない'],
    ];
  }
  function fillInfo() {
    var dl = imenu.querySelector('.info-list');
    dl.textContent = '';
    envRows().forEach(function (r) {
      var dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = r[0];
      dd.textContent = r[1];
      dl.append(dt, dd);
    });
  }
  function closeInfo(why) {
    if (!imenu || imenu.hidden) return;
    imenu.hidden = true;
    ibtn.setAttribute('aria-expanded', 'false');
    log('環境情報を閉じました' + (why ? '(' + why + ')' : ''));
  }
  function openInfo() {
    fillInfo();
    imenu.style.top = bar.getBoundingClientRect().bottom + 6 + 'px';
    imenu.hidden = false;
    ibtn.setAttribute('aria-expanded', 'true');
    log('環境情報を開きました(' + os + ' ' + br + ' / ' + innerHeight + '×' + innerWidth + 'px)');
  }
  /* カラーボタンの前に足す(ヘッダのあるページだけ)。ボタンの押下は log.js の自動ログ、中の表は自動ログを止める */
  if (bar) {
    ibtn = document.createElement('button');
    ibtn.className = 'dbg-btn';
    ibtn.id = 'infoBtn';
    ibtn.type = 'button';
    ibtn.dataset.log = '環境情報';
    ibtn.title = '環境情報';
    ibtn.setAttribute('aria-label', '環境情報');
    ibtn.setAttribute('aria-haspopup', 'dialog');
    ibtn.setAttribute('aria-expanded', 'false');
    ibtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".7"/></svg>';
    bar.insertBefore(ibtn, cbtn || tbtn);

    imenu = document.createElement('div');
    imenu.className = 'color-menu info-menu';
    imenu.id = 'infoMenu';
    imenu.hidden = true;
    imenu.dataset.log = 'off';
    imenu.setAttribute('role', 'dialog');
    imenu.setAttribute('aria-label', '環境情報');
    imenu.innerHTML = '<p class="color-menu-title">環境情報</p><dl class="info-list"></dl>';
    document.body.appendChild(imenu);
    ibtn.setAttribute('aria-controls', imenu.id);

    ibtn.onclick = function () {
      if (imenu.hidden) openInfo();
      else closeInfo();
    };
    document.addEventListener('click', function (e) {
      if (!imenu.hidden && !imenu.contains(e.target) && !ibtn.contains(e.target)) closeInfo('外側を押下');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !imenu.hidden) {
        closeInfo('Escapeキー');
        ibtn.focus();
      }
    });
  }

  /* デバッグ画面(eruda) */
  var dbtn = document.getElementById('dbgBtn'),
    loaded = false,
    shown = false;
  if (dbtn) dbtn.setAttribute('data-log', 'デバッグ');
  if (dbtn)
    dbtn.onclick = function () {
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
  /* 「PC版サイト」表示にすると Android でも UA が Linux になるため、対応ブラウザでは userAgentData の platform を優先する */
  var osVer = '';
  var uad = navigator.userAgentData;
  if (uad) {
    if (uad.platform === 'Android') os = 'Android';
    else if (uad.platform === 'Chrome OS') os = 'ChromeOS';
    if (uad.getHighEntropyValues)
      uad.getHighEntropyValues(['platformVersion']).then(
        function (v) {
          if (os === 'Android' && v.platformVersion) osVer = v.platformVersion.split('.')[0];
          if (imenu && !imenu.hidden) fillInfo();
        },
        function () {
          /* 取得できない時はバージョンなしで表示する */
        }
      );
  }
})();
