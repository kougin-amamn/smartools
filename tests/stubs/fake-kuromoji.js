/* kuromoji(@patdx/kuromoji の ES モジュール)の偽物。辞書は読まず、決めた語だけに読みを付ける */
const WORDS = { 刺: 'サ', 腹: 'ハラ', 痛: 'イタ', 熱: 'アツ', 鍋: 'ナベ' };
export class TokenizerBuilder {
  constructor(options) {
    this.options = options;
  }
  build() {
    window.__kuromojiBuilt = true;
    return Promise.resolve({
      tokenize: (text) =>
        Array.from(text).map((c) => ({ surface_form: c, reading: WORDS[c] || '*', pos: '名詞' })),
    });
  }
}
