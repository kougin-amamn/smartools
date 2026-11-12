/* 全ページ共通のテーマ(起動時は時間帯で決め、ボタンでライト⇄ダーク)・カラーテーマ(themes.json から選び全ページで共有)・
   環境情報の画面・埋め込み表示(?embed=1)・ヘッダを隠すページのつまみ・デバッグ画面(eruda)。ログは log.js、環境の判定は env.js(どちらも先に読む)。ページ側で編集しない */
(function () {
  'use strict';
  /* ログは log.js が用意する。読めなかった時も画面が動くよう、何もしないログで代わりにする */
  var log = window.log;
  if (!log) {
    log = function () {};
    log.info = log.warn = log.error = log.debug = log;
  }

  /* ヘッダのボタン
     テーマ・カラーテーマ・環境情報・デバッグの4つは HTML に書かず、ここで足す(並びは 環境情報・カラー・テーマ・デバッグ)。
     押下は log.js の自動ログに任せ、名前を data-log に固定する(テーマの文字は状態で変わるため) */
  var bar = document.querySelector('.site-bar');
  function addHeaderButton(id, name, icon, before, hasPopup) {
    if (!bar) return null;
    var b = document.createElement('button');
    b.className = 'dbg-btn';
    b.id = id;
    b.type = 'button';
    b.dataset.log = name;
    b.title = name;
    b.setAttribute('aria-label', name);
    if (hasPopup) {
      b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-expanded', 'false');
    }
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      icon +
      '</svg>';
    bar.insertBefore(b, before || null);
    return b;
  }

  /* テーマ
     起動した時だけ時間帯で決める(18時〜6時はダーク)。ヘッダのボタンでライト⇄ダークを切り替える(保存はしない) */
  var root = document.documentElement,
    tbtn = addHeaderButton('themeBtn', 'テーマ', ''),
    dbtn = addHeaderButton(
      'dbgBtn',
      'デバッグ',
      '<path d="M8 8h8v8a4 4 0 0 1-8 0zM9 3l1.5 2M15 3l-1.5 2M4 12h4M16 12h4M5 19l3-2M19 19l-3-2"/>',
    );
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
  var themesUrl = new URL(
    'themes.json',
    document.currentScript ? document.currentScript.src : location.href,
  ).href;
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
          return Math.round(v * t + y[i] * (1 - t))
            .toString(16)
            .padStart(2, '0');
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

  var cbtn = null,
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
            'ms)',
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
      },
    );
  }
  /* ヘッダのテーマボタンの前にカラーボタンを足す(ヘッダのあるページだけ)。
     ボタンの押下は log.js の自動ログ、色の一覧は並びが特殊なので自動ログを止めてここで書く */
  if (bar) {
    cbtn = addHeaderButton(
      'colorBtn',
      'カラーテーマ',
      '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.3-2.9H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11.5" r=".6"/><circle cx="10" cy="7.5" r=".6"/><circle cx="15" cy="7.5" r=".6"/>',
      tbtn,
      true,
    );

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
      if (!menu.hidden && !menu.contains(e.target) && !cbtn.contains(e.target))
        closeMenu('外側を押下');
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
    imenu = null,
    Env = window.Env;
  function fillInfo() {
    var dl = imenu.querySelector('.info-list');
    dl.textContent = '';
    Env.rows().forEach(function (r) {
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
    log(
      '環境情報を開きました(' +
        Env.os() +
        ' ' +
        Env.browser() +
        ' / ' +
        innerHeight +
        '×' +
        innerWidth +
        'px)',
    );
  }
  /* カラーボタンの前に足す(ヘッダのあるページだけ。env.js が読めない時は出さない)。
     ボタンの押下は log.js の自動ログ、中の表は自動ログを止める */
  if (bar && Env) {
    ibtn = addHeaderButton(
      'infoBtn',
      '環境情報',
      '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".7"/>',
      cbtn || tbtn,
      true,
    );

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
      if (!imenu.hidden && !imenu.contains(e.target) && !ibtn.contains(e.target))
        closeInfo('外側を押下');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !imenu.hidden) {
        closeInfo('Escapeキー');
        ibtn.focus();
      }
    });
    /* OS の版番号は後から分かるため、開いている時は表示し直す */
    Env.ready.then(function () {
      if (!imenu.hidden) fillInfo();
    });
  }

  /* デバッグ画面(eruda) */
  var loaded = false,
    shown = false;
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

  /* ヘッダを隠すページ(<html class="bar-hidden">)
     ヘッダを画面の上に隠し、右上のつまみで出し入れする。本文(main)に触るか Escape で隠す。画面いっぱいに使うページのため */
  if (bar && !embed && root.classList.contains('bar-hidden')) {
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'bar-handle';
    handle.dataset.log = 'メニュー';
    handle.setAttribute('aria-label', 'メニュー(ヘッダ)を出す');
    handle.setAttribute('aria-expanded', 'false');
    handle.innerHTML = '<span></span>';
    bar.parentNode.insertBefore(handle, bar.nextSibling);
    var setBar = function (open) {
      if (open === root.classList.contains('bar-open')) return;
      root.classList.toggle('bar-open', open);
      handle.setAttribute('aria-expanded', String(open));
      handle.style.top = open ? bar.offsetHeight + 'px' : '';
    };
    handle.addEventListener('click', function () {
      setBar(!root.classList.contains('bar-open'));
    });
    document.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('main')) setBar(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setBar(false);
    });
  }
})();
