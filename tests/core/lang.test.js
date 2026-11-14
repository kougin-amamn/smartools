/* 言語のファイル(lang/*.json)がそろっているか(docs/design/i18n.md)。キーが同じ・ツール・分類・注意の札がすべてある・空の文が無い */
const a = require('assert');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../../lang');
const tools = require('../../index-data.json');

function keysOf(o, prefix = '') {
  return Object.keys(o).flatMap((k) =>
    o[k] && typeof o[k] === 'object' ? keysOf(o[k], prefix + k + '.') : [prefix + k],
  );
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
a.ok(files.includes('ja.json') && files.includes('en.json'), 'ja.json と en.json がある');
const ja = JSON.parse(fs.readFileSync(path.join(dir, 'ja.json'), 'utf8'));
const jaKeys = keysOf(ja).sort();

for (const f of files) {
  const lang = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const keys = keysOf(lang).sort();
  a.deepEqual(keys, jaKeys, `${f} のキーが ja.json と同じ`);
  keys.forEach((k) => {
    const v = k.split('.').reduce((o, p) => o[p], lang);
    a.ok(typeof v === 'string' && v.trim(), `${f} の ${k} が空でない`);
  });
  tools.forEach((t) => {
    a.ok(lang.tools[t.slug], `${f} にツール ${t.slug} がある`);
    a.ok(t.cat in lang.categories, `${f} に分類 ${t.cat} がある`);
    (t.tags || []).forEach((g) => a.ok(g in lang.tags, `${f} に注意の札 ${g} がある`));
  });
}
console.log('OK lang.test.js(' + files.length + ' 言語 / ' + jaKeys.length + ' キー)');
