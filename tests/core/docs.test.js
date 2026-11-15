/* 文書(docs/)が OKF(Open Knowledge Format)の形に合っているか(docs/log.md 2026-11-15)。
   index.md 以外の .md は先頭に YAML があり type が空でない、index.md は YAML が無い(一番上だけ okf_version)、
   どの文書もいずれかの index.md から辿れる、文書の中の相対リンクの先がある。
   README.md は GitHub でフォルダを開いた時の入口で、束の外(index.md へ案内するだけ) */
const a = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../docs');

function filesOf(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesOf(p) : e.name.endsWith('.md') && e.name !== 'README.md' ? [p] : [];
  });
}
function frontMatterOf(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split('\n')
      .filter((l) => /^[\w-]+:/.test(l))
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
  );
}

const files = filesOf(root);
const linked = new Set();
files.forEach((file) => {
  const name = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const fm = frontMatterOf(text);
  if (path.basename(file) === 'index.md') {
    if (name === 'index.md') a.ok(fm && fm.okf_version, 'docs/index.md に okf_version がある');
    else a.ok(!fm, `${name} に YAML が無い(index.md は一覧だけ)`);
  } else {
    a.ok(fm, `${name} の先頭に YAML がある`);
    a.ok(fm.type, `${name} の type が空でない`);
    a.ok(fm.title && fm.description, `${name} に title と description がある`);
    if (fm.status) a.ok(/^(draft|stable|deprecated)$/.test(fm.status), `${name} の status が決まった値`);
  }
  /* 相対リンクの先があるか。index.md のリンクは「辿れる文書」として覚える */
  for (const m of text.matchAll(/\]\((\.{1,2}\/[^)#\s]+)/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    a.ok(fs.existsSync(target), `${name} のリンク先 ${m[1]} がある`);
    if (path.basename(file) === 'index.md') linked.add(target);
  }
});
files
  .filter((f) => path.basename(f) !== 'index.md' || path.relative(root, f) !== 'index.md')
  .forEach((f) => a.ok(linked.has(f), `${path.relative(root, f)} がどこかの index.md に載っている`));
console.log('OK docs.test.js(' + files.length + ' 文書)');
