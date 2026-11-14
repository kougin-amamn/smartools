/* 画面の文の言語(日本語・英語)。lang/<言語>.json を読み、data-i18n の付いた要素と、ヘッダ・ツールの見出しに当てる。
   site.js が読み込む(HTML には書かない)。設計: docs/design/i18n.md */
(function (root) {
  'use strict';
  var KEY = 'site-language',
    LANGUAGES = ['ja', 'en'],
    self = document.currentScript,
    folder = self ? new URL('../lang/', self.src).href : '../../lang/';

  /* 選んだ言語。無ければ端末の言語(日本語なら ja、それ以外は en) */
  function chosen() {
    try {
      var saved = localStorage.getItem(KEY);
      if (LANGUAGES.indexOf(saved) >= 0) return saved;
    } catch (e) {
      /* 保存領域が使えない時は端末の言語で決める */
    }
    return /^ja\b/i.test(navigator.language || 'ja') ? 'ja' : 'en';
  }
  var language = chosen(),
    words = null;
  document.documentElement.lang = language;

  /* キー(例 'list.sortRecent')の文。差し込み {名前} を埋める。無ければ fallback(多くは日本語の文) */
  function t(key, vars, fallback) {
    var v = words
      ? key.split('.').reduce(function (o, k) {
          return o && o[k];
        }, words)
      : null;
    var text = typeof v === 'string' ? v : fallback != null ? fallback : key;
    Object.keys(vars || {}).forEach(function (k) {
      text = text.split('{' + k + '}').join(vars[k]);
    });
    return text;
  }

  /* data-i18n="キー" の要素は文を、data-i18n-label="キー" の要素は aria-label と title を置き換える */
  function apply(scope) {
    var base = scope || document;
    base.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.dataset.i18n, null, el.textContent);
    });
    base.querySelectorAll('[data-i18n-label]').forEach(function (el) {
      var text = t(el.dataset.i18nLabel, null, el.getAttribute('aria-label'));
      el.setAttribute('aria-label', text);
      if (el.title) el.title = text;
    });
  }

  /* ツールのページ: 見出しと題名をその言語の名前にする(英語では英名の小さな添え字を隠す) */
  function applyToolTitle() {
    var m = /\/tools\/([^/]+)\//.exec(location.pathname),
      tool = m && words && words.tools && words.tools[m[1]];
    var h1 = document.querySelector('.site-bar h1');
    if (!tool || !h1 || language === 'ja') return;
    var en = h1.querySelector('.en');
    if (en) en.hidden = true;
    var textNode = Array.prototype.find.call(h1.childNodes, function (n) {
      return n.nodeType === 3 && n.textContent.trim();
    });
    if (textNode) textNode.textContent = tool.title;
    document.title = tool.title + ' | ' + tool.desc;
  }

  function setLanguage(next) {
    if (LANGUAGES.indexOf(next) < 0 || next === language) return;
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {
      if (root.log) log.warn('表示の言語を保存できませんでした(このページだけ切り替えます)', e);
    }
    location.reload();
  }

  var ready = fetch(folder + language + '.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      words = data;
      apply();
      applyToolTitle();
      document.dispatchEvent(new CustomEvent('i18n-ready', { detail: { language: language } }));
      return language;
    })
    .catch(function (e) {
      if (root.log) log.warn('言語のファイルを読み込めませんでした(日本語のまま表示します)', e);
      return 'ja';
    });

  root.I18n = {
    LANGUAGES: LANGUAGES,
    language: language,
    t: t,
    apply: apply,
    ready: ready,
    setLanguage: setLanguage,
    isReady: function () {
      return !!words;
    },
  };
})(window);
