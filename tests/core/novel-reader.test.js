/* tools/novel-reader の処理部分(ルビ記法・文の区切り・音声合成に渡す文) */
const C = require('../../tools/novel-reader/novel-reader-core.js');
const a = require('assert');

a.deepStrictEqual(C.segmentsFromLine('彼は|魔法使い《ウィザード》だ'), [
  { text: '彼は' },
  { text: '魔法使い', ruby: 'ウィザード' },
  { text: 'だ' },
]);
a.deepStrictEqual(C.segmentsFromLine('東京《とうきょう》へ'), [
  { text: '東京', ruby: 'とうきょう' },
  { text: 'へ' },
]);
a.deepStrictEqual(C.segmentsFromLine('｜ああ《いい》'), [{ text: 'ああ', ruby: 'いい' }]);
a.deepStrictEqual(C.segmentsFromLine('《《ここ》》が大事'), [{ text: 'ここが大事' }]);
a.equal(C.paragraphsFromText('一行目\r\n\r\n二行目\n').length, 2);
a.equal(
  C.textFromParagraphs(C.paragraphsFromText('彼は|魔法使い《ウィザード》だ')),
  '彼は|魔法使い《ウィザード》だ',
);

/* 文の区切り: 。と閉じかっこ、ルビの中では切らない */
const s = C.sentencesFromParagraph(
  C.segmentsFromLine('「刺された。」腹が痛い！東京《とうきょう》。続き'),
);
a.deepStrictEqual(s.map(C.plainText), ['「刺された。」', '腹が痛い！', '東京。', '続き']);

/* 音声合成に渡す文 */
const tokenize = (t) =>
  ({
    '僕は今日、': [
      { surface_form: '僕', reading: 'ボク', pos: '名詞' },
      { surface_form: 'は', reading: 'ハ', pos: '助詞' },
      { surface_form: '今日', reading: 'キョウ', pos: '名詞' },
      { surface_form: '、', reading: '、', pos: '記号' },
    ],
    へ行く: [
      { surface_form: 'へ', reading: 'ヘ', pos: '助詞' },
      { surface_form: '行く', reading: 'イク', pos: '動詞' },
    ],
  })[t] || [{ surface_form: t, reading: '*', pos: '名詞' }];
const seg = C.segmentsFromLine('僕は今日、東京《とうきょう》へ行く');
a.equal(C.speechTextOf(seg, 'original', tokenize), '僕は今日、東京へ行く');
a.equal(C.speechTextOf(seg, 'ruby', tokenize), '僕は今日、とうきょうへ行く');
a.equal(C.speechTextOf(seg, 'kana', tokenize), 'ぼくわきょう、とうきょうえいく');
a.equal(C.speechTextOf(seg, 'kana', null), '僕は今日、とうきょうへ行く');
a.equal(C.hiraganaOf('カタカナー'), 'かたかなー');
a.equal(C.countRuby([seg]), 1);

a.ok(C.isParagraphs([[{ text: 'a' }, { text: 'b', ruby: 'c' }]]));
a.ok(!C.isParagraphs([[{ text: 1 }]]));
a.ok(!C.isParagraphs('text'));
