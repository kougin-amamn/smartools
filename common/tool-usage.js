/* ツールを開いた日時と回数の記録(この端末のブラウザだけ)と、一覧の並べ替え。DOM を使わず Node でも試せる。
   ツールのページでは tool-kit.js が読み込み、ページの場所から自動で記録する。設計: docs/design/tool-sort.md */
(function (root) {
  'use strict';
  var KEY = 'tool-usage';
  var MODES = ['category', 'recent', 'frequent', 'name'];

  function storage() {
    try {
      return root.localStorage || null;
    } catch (e) {
      return null;
    }
  }
  /* 記録を読む。読めない・壊れている時は空 */
  function usage() {
    var s = storage();
    if (!s) return {};
    try {
      var data = JSON.parse(s.getItem(KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }
  /* 1回開いたことを記録する。書けない時(プライベートブラウズなど)は何もしない */
  function record(slug, now) {
    var s = storage();
    if (!s || !slug) return false;
    var data = usage(),
      item = data[slug] || { count: 0, last: 0 };
    item.count += 1;
    item.last = now || Date.now();
    data[slug] = item;
    try {
      s.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 並べ替え。category は元の順のまま。ほかは開いた事のあるツールを先に、無いツールは元の順で後ろに */
  function sortTools(tools, mode, data) {
    data = data || {};
    var list = tools.map(function (t, i) {
      return { tool: t, index: i, use: data[t.slug] || null };
    });
    var byIndex = function (a, b) {
      return a.index - b.index;
    };
    var compare = {
      recent: function (a, b) {
        return b.use.last - a.use.last;
      },
      frequent: function (a, b) {
        return b.use.count - a.use.count || b.use.last - a.use.last;
      },
    }[mode];
    if (mode === 'name')
      list.sort(function (a, b) {
        return a.tool.title.localeCompare(b.tool.title, 'ja');
      });
    else if (compare) {
      var used = list.filter(function (x) {
          return x.use;
        }),
        unused = list.filter(function (x) {
          return !x.use;
        });
      list = used.sort(compare).concat(unused.sort(byIndex));
    }
    return list.map(function (x) {
      return x.tool;
    });
  }

  /* 最後に開いてからの時間の文 */
  /* say(キー, 差し込み, 日本語の文) を渡すと、その言語の文にする(i18n.js の I18n.t)。無ければ日本語 */
  function agoText(last, now, say) {
    say =
      say ||
      function (key, vars, fallback) {
        return Object.keys(vars || {}).reduce(function (text, k) {
          return text.split('{' + k + '}').join(vars[k]);
        }, fallback);
      };
    var minutes = Math.floor((now - last) / 60000);
    if (minutes < 1) return say('list.justNow', null, 'たった今');
    if (minutes < 60) return say('list.minutesAgo', { 数: minutes }, '{数}分前');
    if (minutes < 60 * 24)
      return say('list.hoursAgo', { 数: Math.floor(minutes / 60) }, '{数}時間前');
    if (minutes < 60 * 24 * 7)
      return say('list.daysAgo', { 数: Math.floor(minutes / 60 / 24) }, '{数}日前');
    var d = new Date(last);
    return say('list.monthDay', { 月: d.getMonth() + 1, 日: d.getDate() }, '{月}月{日}日');
  }

  var api = {
    KEY: KEY,
    MODES: MODES,
    usage: usage,
    record: record,
    sortTools: sortTools,
    agoText: agoText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ToolUsage = api;

  /* ツールのページ(…/tools/<slug>/…)なら、開いたことを記録する */
  if (root.location) {
    var m = /\/tools\/([^/]+)\//.exec(root.location.pathname);
    if (m) record(decodeURIComponent(m[1]));
  }
})(typeof window !== 'undefined' ? window : globalThis);
