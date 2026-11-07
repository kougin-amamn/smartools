/* 一覧ページ。index-data.json のツールを分類ごとに並べる。common/site.js(ログ・テーマ)の後に読み込む */
(function () {
  'use strict';
  log.started.later(); // 一覧を読んで並べ終えた時に出す
  var listEl = document.getElementById('list'),
    statusEl = document.getElementById('status');

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

  function cardEl(t) {
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
    if (t.en) {
      var en = document.createElement('p');
      en.className = 'en';
      en.textContent = t.en;
      body.append(en);
    }
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
    a.append(iconEl(t), body);
    a.setAttribute('data-log', t.title);
    var li = document.createElement('li');
    li.appendChild(a);
    return li;
  }

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
      n.textContent = by[c].length + '件';
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
      JSON.stringify({ href: location.href, title: 'ツール一覧' }),
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
      var nav = document.getElementById('views');
      list.forEach(function (l) {
        var a = document.createElement('a');
        a.className = 'view';
        a.href = fromRoot(l.href);
        a.textContent = l.title;
        nav.appendChild(a);
      });
      nav.hidden = list.length === 0;
    })
    .catch(function (e) {
      log.warn('ランチャーの一覧を読み込めませんでした(切り替えを出さずに表示します)', e);
    });

  fetch('./index-data.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (tools) {
      var cats = render(tools);
      statusEl.hidden = true;
      log.started(tools.length + '件 / ' + cats + '分類');
    })
    .catch(function (e) {
      statusEl.textContent =
        'ツールの一覧を読み込めませんでした。https で配信したページ(または http://127.0.0.1 のローカルサーバー)で開いてください。';
      statusEl.classList.add('error');
      log.error('ツールの一覧の読み込みでエラーが発生しました', e);
    });
})();
