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

  /* ツールの中の文(段 3): en.json の tools.<slug>.text に「日本語の文 → その言語の文」。キーの {名前} は差し込み */
  var toolSlug = (/\/tools\/([^/]+)\//.exec(location.pathname) || [])[1],
    texts = null,
    patterns = [];
  function fill(text, vars) {
    Object.keys(vars || {}).forEach(function (k) {
      text = text.split('{' + k + '}').join(vars[k]);
    });
    return text;
  }
  function escapeRegExp(text) {
    return text.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }
  function prepareTexts() {
    /* 共通の部品(device.js・env.js)が出す文は words.text。ツールの表に同じ文があれば、ツールの方を使う */
    var tool = words && words.tools && words.tools[toolSlug];
    if (!tool || !tool.text) return; // 訳をまだ書いていないツールは日本語のまま
    texts = Object.assign({}, words.text, tool.text);
    patterns = Object.keys(texts || {})
      .filter(function (k) {
        return /\{[^}]+\}/.test(k);
      })
      .map(function (k) {
        var names = [],
          source = k.split(/(\{[^}]+\})/).map(function (part) {
            var m = /^\{([^}]+)\}$/.exec(part);
            if (!m) return escapeRegExp(part);
            names.push(m[1]);
            return '(.*?)'; // 空のこともある(例「物を{範囲}大きく…」)
          });
        return { regexp: new RegExp('^' + source.join('') + '$'), names: names, key: k };
      })
      .sort(function (a, b) {
        return b.key.length - a.key.length; // 長い形(年まである日付など)を先に試す
      });
  }
  /* 日本語の文を、今の言語の文にする。対応表に無ければ日本語のまま(差し込みは埋める) */
  function say(japanese, vars) {
    var text =
      texts && Object.prototype.hasOwnProperty.call(texts, japanese) ? texts[japanese] : japanese;
    return fill(text, vars);
  }
  /* 画面に出た文の置き換え。まるごと一致した時と、差し込みの形に合った時だけ */
  function translated(text) {
    var trimmed = text.trim(),
      key = trimmed.replace(/\s+/g, ' '); // HTML の中で折り返した文も、空白1つにそろえて引く
    if (!trimmed || !texts) return null;
    if (Object.prototype.hasOwnProperty.call(texts, key)) return text.replace(trimmed, texts[key]);
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].regexp.exec(key);
      if (!m) continue;
      var vars = {};
      patterns[i].names.forEach(function (name, n) {
        var part = m[n + 1],
          inner = part.length < key.length ? translated(part) : null; // 差し込まれた値も、形が合えば訳す
        vars[name] = inner !== null ? inner : say(part);
      });
      return text.replace(trimmed, fill(texts[patterns[i].key], vars));
    }
    return null;
  }
  /* 文を置き換えない所(入力欄の中身・ログ)。名前(aria-label など)は、入力欄でも置き換える */
  var SKIP = 'script,style,textarea,[contenteditable],[data-i18n-skip],#eruda',
    SKIP_NAMES = '[data-i18n-skip],#eruda',
    ATTRIBUTES = ['aria-label', 'title', 'placeholder'];
  function translateElement(el) {
    if (el.closest(SKIP_NAMES)) return;
    ATTRIBUTES.forEach(function (name) {
      var v = el.getAttribute(name),
        t = v && translated(v);
      if (t !== null && t !== undefined && t !== v) el.setAttribute(name, t);
    });
  }
  function translateNode(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest(SKIP)) return;
      var t = translated(node.nodeValue);
      if (t !== null && t !== node.nodeValue) node.nodeValue = t;
      return;
    }
    if (node.nodeType !== 1) return;
    translateElement(node);
    if (node.closest(SKIP)) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      var n = walker.currentNode;
      if (n.nodeType === 3) translateNode(n);
      else translateElement(n);
    }
  }
  function watchTexts() {
    if (!texts || !document.body) return;
    translateNode(document.body);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'characterData') translateNode(r.target);
        else if (r.type === 'attributes') translateElement(r.target);
        else r.addedNodes.forEach(translateNode);
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
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
      if (language !== 'ja') {
        prepareTexts();
        watchTexts();
      }
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
    say: say,
    apply: apply,
    ready: ready,
    setLanguage: setLanguage,
    isReady: function () {
      return !!words;
    },
  };
})(window);
