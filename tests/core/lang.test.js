/* 言語のファイル(lang/*.json)がそろっているか(docs/design/i18n.md)。キーが同じ・ツール・分類・注意の札がすべてある・空の文が無い。
   ツールの中の文(tools.<slug>.text。日本語の文がキー)は日本語のファイルに無いので比べず、キーの文がツールの html・js にあるかを見る */
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
const isText = (k) => /^tools\.[^.]+\.text\./.test(k);
const jaKeys = keysOf(ja).sort();

for (const f of files) {
  const lang = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const keys = keysOf(lang).sort();
  a.deepEqual(
    keys.filter((k) => !isText(k)),
    jaKeys,
    `${f} のキーが ja.json と同じ`,
  );
  keys
    .filter((k) => !isText(k))
    .forEach((k) => {
      const v = k.split('.').reduce((o, p) => o[p], lang);
      a.ok(typeof v === 'string' && v.trim(), `${f} の ${k} が空でない`);
    });
  Object.keys(lang.tools).forEach((slug) => {
    const text = lang.tools[slug].text;
    if (!text) return;
    const folder = path.join(__dirname, '../../tools', slug);
    const source =
      fs
        .readdirSync(folder)
        .filter((n) => /\.(html|js)$/.test(n))
        .map((n) => fs.readFileSync(path.join(folder, n), 'utf8'))
        .join('\n') +
      /* 共通の部品が出す文(例 https が必要な時の案内)もツールの画面に出る */
      ['env.js', 'device.js']
        .map((n) => fs.readFileSync(path.join(__dirname, '../../common', n), 'utf8'))
        .join('\n');
    Object.keys(text).forEach((japanese) => {
      a.ok(
        typeof text[japanese] === 'string' && text[japanese].trim(),
        `${f} の ${slug} の「${japanese}」の訳が空でない`,
      );
      /* 差し込み {名前} の間の文が、それぞれツールの中にある(訳が古くなっていない) */
      japanese
        .split(/\{[^}]+\}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) =>
          a.ok(source.includes(part), `${f} の ${slug} の「${japanese}」がツールに無い(${part})`),
        );
    });
  });
  tools.forEach((t) => {
    a.ok(lang.tools[t.slug], `${f} にツール ${t.slug} がある`);
    a.ok(t.cat in lang.categories, `${f} に分類 ${t.cat} がある`);
    (t.tags || []).forEach((g) => a.ok(g in lang.tags, `${f} に注意の札 ${g} がある`));
  });
}
console.log('OK lang.test.js(' + files.length + ' 言語 / ' + jaKeys.length + ' キー)');
