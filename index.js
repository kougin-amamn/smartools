/* 一覧ページ。index-data.json のツールを、選んだ並び(分類・最近・よく使う・名前)で並べる。
   common/site.js(ログ・テーマ)と common/tool-usage.js(開いた記録と並べ替え)の後に読み込む。設計: docs/design/tool-sort.md */
(function () {
  'use strict';
  log.started.later(); // 一覧を読んで並べ終えた時に出す
  var listEl = document.getElementById('list'),
    statusEl = document.getElementById('status'),
    sortsEl = document.getElementById('sorts'),
    sortSelect = document.getElementById('sortSelect');
  /* ヘッダの高さを CSS に渡す(表示・並び順の行をヘッダのすぐ下に残すため。文字の大きさや折り返しで変わる) */
  var siteBar = document.querySelector('.site-bar');
  function setBarHeight() {
    if (siteBar)
      document.documentElement.style.setProperty('--site-bar-height', siteBar.offsetHeight + 'px');
  }
  setBarHeight();
  if (siteBar && window.ResizeObserver) new ResizeObserver(setBarHeight).observe(siteBar);

  var SORT_KEY = 'index-sort',
    allTools = [];

  /* 画面の文の言語(common/i18n.js)。読めない時は日本語の文 fallback */
  function say(key, vars, fallback) {
    if (window.I18n) return I18n.t(key, vars, fallback);
    return Object.keys(vars || {}).reduce(function (text, k) {
      return text.split('{' + k + '}').join(vars[k]);
    }, fallback);
  }
  /* その言語のツールの名前・説明・分類・注意の札にする。ログの名前(data-log)には日本語の名前 jaTitle を使う */
  function translated(t) {
    var copy = Object.assign({}, t, { jaTitle: t.title });
    if (!window.I18n || I18n.language === 'ja') return copy;
    copy.title = say('tools.' + t.slug + '.title', null, t.title);
    copy.desc = say('tools.' + t.slug + '.desc', null, t.desc || '');
    copy.cat = say('categories.' + t.cat, null, t.cat);
    copy.tags = (t.tags || []).map(function (g) {
      return say('tags.' + g, null, g);
    });
    return copy;
  }

  /* href / icon は省略時 tools/<slug>/ の中を指す。書いてあればサイトのルートからの相対パス(または絶対URL) */
  function fromRoot(path) {
    return /^(https?:|data:)/.test(path) ? path : './' + path.replace(/^\.?\//, '');
  }
  function hrefOf(t) {
    return t.href ? fromRoot(t.href) : './tools/' + t.slug + '/' + t.slug + '.html';
  }
  function iconOf(t) {
    return t.icon ? fromRoot(t.icon) : './tools/' + t.slug + '/app-icon-' + t.slug + '.svg';
  }

  /* アイコン画像が無い時は、名前の1文字目のマークにする */
  function iconEl(t) {
    var img = document.createElement('img');
    img.className = 'icon';
    img.alt = '';
    img.loading = 'lazy';
    img.src = iconOf(t);
    img.onerror = function () {
      var m = document.createElement('span');
      m.className = 'mark';
      m.setAttribute('aria-hidden', 'true');
      m.textContent = (t.title || '?').charAt(0);
      img.replaceWith(m);
    };
    return img;
  }

  /* 並べ替えた時だけ、カードに最後に開いた日時か回数を添える */
  function noteOf(t, mode, data) {
    var use = data[t.slug];
    if (!use) return '';
    if (mode === 'recent') return ToolUsage.agoText(use.last, Date.now(), say);
    if (mode === 'frequent') return say('list.times', { 回数: use.count }, '{回数}回');
    return '';
  }

  function cardEl(t, note) {
    var a = document.createElement('a'),
      body = document.createElement('div'),
      title = document.createElement('p'),
      desc = document.createElement('p');
    a.className = 'card';
    a.href = hrefOf(t);
    title.className = 'title';
    title.textContent = t.title;
    desc.className = 'desc';
    desc.textContent = t.desc || '';
    body.className = 'body';
    body.append(title);
    body.append(desc);
    if (t.tags && t.tags.length) {
      var tags = document.createElement('div');
      tags.className = 'tags';
      t.tags.forEach(function (s) {
        var g = document.createElement('span');
        g.className = 'tag';
        g.textContent = s;
        tags.appendChild(g);
      });
      body.appendChild(tags);
    }
    if (note) {
      var u = document.createElement('span');
      u.className = 'use';
      u.textContent = note;
      a.append(iconEl(t), body, u);
    } else a.append(iconEl(t), body);
    a.setAttribute('data-log', t.jaTitle || t.title);
    var li = document.createElement('li');
    li.appendChild(a);
    return li;
  }

  /* 分類以外の並び: 見出しを外して1列にする */
  function renderFlat(tools, mode) {
    var data = ToolUsage.usage(),
      ul = document.createElement('ul');
    ul.className = 'grid';
    ToolUsage.sortTools(tools, mode, data).forEach(function (t) {
      ul.appendChild(cardEl(t, noteOf(t, mode, data)));
    });
    listEl.textContent = '';
    listEl.appendChild(ul);
  }
  function sortModeOf() {
    try {
      var m = localStorage.getItem(SORT_KEY);
      return window.ToolUsage && ToolUsage.MODES.indexOf(m) >= 0 ? m : 'category';
    } catch (e) {
      return 'category';
    }
  }
  function show(mode) {
    sortSelect.value = mode;
    if (mode === 'category') render(allTools);
    else renderFlat(allTools, mode);
  }
  sortSelect.addEventListener('change', function () {
    try {
      localStorage.setItem(SORT_KEY, sortSelect.value);
    } catch (err) {
      log.warn('並びの保存に失敗しました(このページだけ並べ替えます)', err);
    }
    show(sortSelect.value);
  });

  /* 分類は index-data.json に出てきた順に並べる */
  function render(tools) {
    var cats = [],
      by = {};
    tools.forEach(function (t) {
      if (!by[t.cat]) {
        by[t.cat] = [];
        cats.push(t.cat);
      }
      by[t.cat].push(t);
    });
    listEl.textContent = '';
    cats.forEach(function (c, i) {
      var sec = document.createElement('section'),
        h = document.createElement('h2'),
        n = document.createElement('span'),
        ul = document.createElement('ul');
      sec.className = 'cat';
      sec.setAttribute('aria-labelledby', 'cat' + i);
      h.className = 'cat-head';
      h.id = 'cat' + i;
      h.textContent = c;
      n.className = 'cat-count';
      n.textContent = say('list.count', { 件数: by[c].length }, '{件数}件');
      h.appendChild(n);
      ul.className = 'grid';
      by[c].forEach(function (t) {
        ul.appendChild(cardEl(t));
      });
      sec.append(h, ul);
      listEl.appendChild(sec);
    });
    return cats.length;
  }

  /* ツールの「戻る」ボタン(tool-kit.js)がこの一覧に戻れるよう、ランチャーと同じ形で戻り先を残す */
  try {
    localStorage.setItem(
      'launcher-return',
      JSON.stringify({ href: location.href, title: 'ツール一覧', titleKey: 'list.title' }),
    );
  } catch (e) {
    log.warn('戻り先の保存に失敗しました', e);
  }

  /* ランチャーへの切り替え。一覧は launchers/launchers.json(href はサイトのルートからの相対パス) */
  fetch('./launchers/launchers.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (list) {
      return (window.I18n ? I18n.ready : Promise.resolve()).then(function () {
        return list;
      });
    })
    .then(function (list) {
      /* 小さな画面でも1行に収まるよう、選ぶ欄(プルダウン)にする。選ぶとそのランチャーを開く */
      var views = document.getElementById('views'),
        viewSelect = document.getElementById('viewSelect');
      list.forEach(function (l) {
        var o = document.createElement('option');
        o.value = fromRoot(l.href);
        o.textContent = say('launchers.' + l.id + '.chip', null, l.title);
        o.dataset.log = l.title;
        viewSelect.appendChild(o);
      });
      viewSelect.addEventListener('change', function () {
        var o = viewSelect.selectedOptions[0];
        log('表示を「' + (o.dataset.log || '一覧') + '」に切り替えます');
        location.href = viewSelect.value;
      });
      /* 戻るで一覧に戻った時、前に選んだランチャーが残らないようにする */
      window.addEventListener('pageshow', function () {
        viewSelect.selectedIndex = 0;
      });
      views.hidden = list.length === 0;
    })
    .catch(function (e) {
      log.warn('ランチャーの一覧を読み込めませんでした(切り替えを出さずに表示します)', e);
    });

  var toolsLoaded = fetch('./index-data.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
  Promise.all([toolsLoaded, window.I18n ? I18n.ready : null])
    .then(function (results) {
      var tools = results[0].map(translated);
      allTools = tools;
      if (window.I18n && I18n.language !== 'ja')
        document.title = say('list.metaTitle', null, document.title);
      var cats = render(tools),
        mode = sortModeOf();
      sortsEl.hidden = !window.ToolUsage; // 記録の部品が読めない時は、分類の順だけ
      if (window.ToolUsage) show(mode);
      statusEl.hidden = true;
      log.started(tools.length + '件 / ' + cats + '分類 / 並び ' + mode);
    })
    .catch(function (e) {
      statusEl.textContent = say(
        'list.loadFailed',
        null,
        'ツールの一覧を読み込めませんでした。https で配信したページ(または http://127.0.0.1 のローカルサーバー)で開いてください。',
      );
      statusEl.classList.add('error');
      log.error('ツールの一覧の読み込みでエラーが発生しました', e);
    });
})();
