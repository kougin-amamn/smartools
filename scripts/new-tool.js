/* 新しいツールのひな形を作る。tools/<slug>/ に html・css・js・アイコンを、docs/design/<slug>.md に設計書のひな形を置く。
   使い方: node scripts/new-tool.js <slug> <名称> <英名> [キャッチ] [説明]
   例:     node scripts/new-tool.js unit-converter 単位変換 "Unit Converter" "長さ・重さ・温度をすぐ換算"
   既にあるファイルは上書きしない。index-data.json への登録は手で行う(分類と並び順を選ぶため) */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const [slug, name, en, catchCopy, description] = process.argv.slice(2);
if (!slug || !name || !en || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.log(
    '使い方: node scripts/new-tool.js <slug(英小文字とハイフン)> <名称> <英名> [キャッチ] [説明]',
  );
  process.exit(1);
}
const vals = {
  slug: slug,
  名称: name,
  英名: en,
  キャッチ: catchCopy || '(一言キャッチ)',
  説明: description || '(70〜120字で機能と特徴を具体的に。オフライン対応はうたわない)',
};
function fill(text) {
  return text.replace(/\{\{([^{}]+)\}\}/g, (m, k) => (k in vals ? vals[k] : m));
}

const files = {
  ['tools/' + slug + '/' + slug + '.html']: fill(
    fs.readFileSync(path.join(__dirname, 'template/tool.html'), 'utf8'),
  ),
  ['tools/' + slug + '/' + slug + '.css']:
    '/* ' +
    name +
    'の画面 */\n.content {\n  flex-direction: column;\n  padding: 16px 18px calc(env(safe-area-inset-bottom, 0px) + 16px);\n  gap: 12px;\n  overflow-y: auto;\n}\n.app {\n  max-width: 380px;\n  align-items: center;\n  gap: 12px;\n}\n',
  ['tools/' + slug + '/' + slug + '.js']:
    '/* ' +
    name +
    "の画面の動き。共通の log・Env・ToolKit を使う */\n(function () {\n  'use strict';\n  var $ = function (id) {\n    return document.getElementById(id);\n  };\n  var statusEl = $('status');\n\n  // 起動のログは log.js が自動で出す。設定などを出す時は、初期化の最後に log.started('…')\n})();\n",
  ['tools/' + slug + '/app-icon-' + slug + '.svg']:
    '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">\n  <rect width="64" height="64" rx="16" fill="#4a4e7a"/>\n  <g transform="translate(9.6 9.6) scale(1.867)">\n    <rect x="3" y="3" width="18" height="18" rx="4" fill="#e9ecf5"/>\n  </g>\n</svg>\n',
  ['docs/design/' + slug + '.md']:
    '# ' +
    name +
    ' 設計書\n\n(作成日)作成\n\n## 概要\n\n## 課題と方針\n\n| 課題 | 方針 |\n| --- | --- |\n\n## 構成\n\n## 仕様\n\n## 処理の流れ\n\n## 制限事項\n\n## 確認\n',
};
for (const [rel, text] of Object.entries(files)) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full)) {
    console.log('そのまま ' + rel + '(既にあります)');
    continue;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  console.log('作成 ' + rel);
}
console.log(
  '次: 設計書を書く → アイコンの絵を描く → index-data.json に1行足す → node tests/smoke.js tools/' +
    slug,
);
