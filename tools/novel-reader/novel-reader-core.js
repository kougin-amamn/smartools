/* 小説読み上げの DOM を使わない処理: ルビ記法の読み取り・文の区切り・音声合成に渡す文の組み立て。Node でも試せる。
   本文の形: 段落 = 区切り(segment)の配列、区切り = {text} か {text, ruby}(ruby は作者の付けた読み) */
(function (root) {
  'use strict';

  /* ルビ記法: |漢字《かんじ》・｜漢字《かんじ》・漢字《かんじ》(親文字は直前の漢字の並び)。《《傍点》》は傍点なので文字だけ残す */
  var KANJI = '[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff々〆ヶ〇]';
  var RUBY_PATTERN = new RegExp(
    '[|｜]([^|｜《》\\n]+)《([^《》\\n]+)》|(' + KANJI + '+)《([^《》\\n]+)》',
    'g',
  );
  function segmentsFromLine(line) {
    line = line.replace(/《《([^《》]*)》》/g, '$1');
    var segments = [],
      last = 0,
      m;
    RUBY_PATTERN.lastIndex = 0;
    while ((m = RUBY_PATTERN.exec(line))) {
      if (m.index > last) segments.push({ text: line.slice(last, m.index) });
      segments.push({ text: m[1] || m[3], ruby: m[2] || m[4] });
      last = RUBY_PATTERN.lastIndex;
    }
    if (last < line.length) segments.push({ text: line.slice(last) });
    return segments;
  }
  /* 貼り付けた文章 → 段落の配列(空の行は除く) */
  function paragraphsFromText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter(function (line) {
        return line.trim();
      })
      .map(segmentsFromLine);
  }
  /* 段落の配列 → ルビ記法の文章(貼り付けの予備に使う) */
  function textFromParagraphs(paragraphs) {
    return paragraphs
      .map(function (segments) {
        return segments
          .map(function (s) {
            return s.ruby ? '|' + s.text + '《' + s.ruby + '》' : s.text;
          })
          .join('');
      })
      .join('\n');
  }

  /* 文の区切り: 。！？!? と、その後に続く閉じかっこの後で切る。ルビの区切りの中では切らない */
  var END_PATTERN = /[。！？!?]+[」』）)】〉》"]*/g;
  function sentencesFromParagraph(segments) {
    var sentences = [],
      current = [];
    function flush() {
      var text = plainText(current);
      if (text.trim()) sentences.push(current);
      current = [];
    }
    segments.forEach(function (s) {
      if (s.ruby) {
        current.push(s);
        return;
      }
      var last = 0,
        m;
      END_PATTERN.lastIndex = 0;
      while ((m = END_PATTERN.exec(s.text))) {
        current.push({ text: s.text.slice(last, END_PATTERN.lastIndex) });
        last = END_PATTERN.lastIndex;
        flush();
      }
      if (last < s.text.length) current.push({ text: s.text.slice(last) });
    });
    flush();
    return sentences;
  }
  function plainText(segments) {
    return segments
      .map(function (s) {
        return s.text;
      })
      .join('');
  }

  /* カタカナ → ひらがな(ー などはそのまま) */
  function hiraganaOf(text) {
    return String(text).replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  /* 形態素解析の1語の読み。助詞の「は」「へ」は発音どおり「わ」「え」にする。読みが無い語(記号・英字・未知語)はそのまま */
  function readingOf(token) {
    if (token.pos === '助詞' && token.surface_form === 'は') return 'わ';
    if (token.pos === '助詞' && token.surface_form === 'へ') return 'え';
    if (!token.reading || token.reading === '*') return token.surface_form;
    return hiraganaOf(token.reading);
  }

  /* 音声合成に渡す文
     mode: 'original'(本文のまま)・'ruby'(ルビの所だけ読み)・'kana'(全部を読みのひらがなに)。
     tokenize(text) → kuromoji の語の配列。まだ使えない時(null)は 'kana' も 'ruby' と同じにする */
  var MODES = ['original', 'ruby', 'kana'];
  function speechTextOf(segments, mode, tokenize) {
    return segments
      .map(function (s) {
        if (mode === 'original') return s.text;
        if (s.ruby) return s.ruby;
        if (mode !== 'kana' || !tokenize) return s.text;
        return tokenize(s.text).map(readingOf).join('');
      })
      .join('');
  }
  function countRuby(paragraphs) {
    return paragraphs.reduce(function (n, segments) {
      return (
        n +
        segments.filter(function (s) {
          return s.ruby;
        }).length
      );
    }, 0);
  }
  /* 受け取った段落の形を確かめる(ブックマークレットから来た物は信用しない) */
  function isParagraphs(value) {
    return (
      Array.isArray(value) &&
      value.every(function (segments) {
        return (
          Array.isArray(segments) &&
          segments.every(function (s) {
            return (
              s &&
              typeof s.text === 'string' &&
              (s.ruby === undefined || typeof s.ruby === 'string')
            );
          })
        );
      })
    );
  }

  var api = {
    MODES: MODES,
    segmentsFromLine: segmentsFromLine,
    paragraphsFromText: paragraphsFromText,
    textFromParagraphs: textFromParagraphs,
    sentencesFromParagraph: sentencesFromParagraph,
    plainText: plainText,
    hiraganaOf: hiraganaOf,
    readingOf: readingOf,
    speechTextOf: speechTextOf,
    countRuby: countRuby,
    isParagraphs: isParagraphs,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') root.NovelReaderCore = api;
})(this);
