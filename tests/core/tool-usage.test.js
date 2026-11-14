/* ツールの記録と並べ替え(docs/design/tool-sort.md) */
const a = require('assert');
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => (store[k] = String(v)),
};
const U = require('../../common/tool-usage.js');

const tools = [
  { slug: 'calculator', title: '電卓', cat: '定番' },
  { slug: 'notepad', title: 'メモ帳', cat: '定番' },
  { slug: 'compass', title: '方位磁針', cat: 'センサー' },
  { slug: 'piano', title: 'ピアノ', cat: 'メディア' },
];

/* 記録: 回数が増え、最後の日時が変わる */
U.record('notepad', 1000);
U.record('compass', 2000);
U.record('notepad', 3000);
U.record('piano', 2500);
a.deepEqual(U.usage().notepad, { count: 2, last: 3000 });
a.deepEqual(U.usage().compass, { count: 1, last: 2000 });

const slugs = (list) => list.map((t) => t.slug).join(',');
const data = U.usage();
a.equal(slugs(U.sortTools(tools, 'category', data)), 'calculator,notepad,compass,piano');
a.equal(slugs(U.sortTools(tools, 'recent', data)), 'notepad,piano,compass,calculator');
a.equal(slugs(U.sortTools(tools, 'frequent', data)), 'notepad,piano,compass,calculator');
/* 名前順は日本語の読みの順(ひらがな・カタカナ・漢字の順に並ぶ localeCompare) */
const named = U.sortTools(tools, 'name', data).map((t) => t.title);
a.deepEqual(
  named,
  [...named].sort((x, y) => x.localeCompare(y, 'ja')),
);
/* 記録が無くても、元の順のまま */
a.equal(slugs(U.sortTools(tools, 'recent', {})), 'calculator,notepad,compass,piano');

/* 壊れた記録でも止まらない */
store['tool-usage'] = '{壊れている';
a.deepEqual(U.usage(), {});
a.equal(U.record('calculator', 5000), true);
a.equal(U.usage().calculator.count, 1);

/* 日時の文 */
const now = new Date(2026, 10, 14, 12, 0).getTime();
a.equal(U.agoText(now - 20 * 1000, now), 'たった今');
a.equal(U.agoText(now - 5 * 60000, now), '5分前');
a.equal(U.agoText(now - 3 * 3600000, now), '3時間前');
a.equal(U.agoText(now - 2 * 86400000, now), '2日前');
a.equal(U.agoText(new Date(2026, 10, 3, 9, 0).getTime(), now), '11月3日');

console.log('OK tool-usage.test.js');
