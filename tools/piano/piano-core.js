/* ピアノの音名・鍵盤配置・コード/スケール・曲データ・練習判定・MIDI書き出し(画面・音に依存しない。Node でテストできる)。window.PianoCore */
(function () {
  var EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var JP = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  function noteToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }
  function isBlack(m) {
    return !!BLACK[((m % 12) + 12) % 12];
  }
  function pc(m) {
    return ((m % 12) + 12) % 12;
  }
  function midiName(m, lang) {
    return (lang === 'jp' ? JP : EN)[pc(m)];
  }
  function midiFull(m) {
    return EN[pc(m)] + (Math.floor(m / 12) - 1);
  }
  // 鍵盤配置: baseOctave(C4=4)から octaves 個ぶん。白鍵の並びと、黒鍵が「何番目の白鍵の右」にあるか
  function buildLayout(baseOctave, octaves) {
    var start = (baseOctave + 1) * 12,
      whites = [],
      blacks = [];
    for (var m = start; m < start + octaves * 12; m++) {
      if (isBlack(m)) blacks.push({ midi: m, after: whites.length - 1 });
      else whites.push({ midi: m });
    }
    return { start: start, end: start + octaves * 12 - 1, whites: whites, blacks: blacks };
  }
  // コード・スケール
  var CHORDS = {
    maj: ['', [0, 4, 7], 'メジャー'],
    min: ['m', [0, 3, 7], 'マイナー'],
    7: ['7', [0, 4, 7, 10], 'セブンス'],
    maj7: ['M7', [0, 4, 7, 11], 'メジャーセブンス'],
    m7: ['m7', [0, 3, 7, 10], 'マイナーセブンス'],
    dim: ['dim', [0, 3, 6], 'ディミニッシュ'],
    aug: ['aug', [0, 4, 8], 'オーギュメント'],
    sus4: ['sus4', [0, 5, 7], 'サスフォー'],
    sus2: ['sus2', [0, 2, 7], 'サスツー'],
    6: ['6', [0, 4, 7, 9], 'シックス'],
  };
  var SCALES = {
    major: ['メジャースケール', [0, 2, 4, 5, 7, 9, 11]],
    minor: ['ナチュラルマイナー', [0, 2, 3, 5, 7, 8, 10]],
    penta: ['ペンタトニック', [0, 2, 4, 7, 9]],
    blues: ['ブルース', [0, 3, 5, 6, 7, 10]],
  };
  // kind: 'chord:maj' / 'scale:major'
  function intervals(kind) {
    var a = kind.split(':');
    return a[0] === 'chord' ? CHORDS[a[1]][1] : SCALES[a[1]][1];
  }
  function pitchClasses(root, kind) {
    return intervals(kind).map(function (i) {
      return (root + i) % 12;
    });
  }
  function label(root, kind, lang) {
    var a = kind.split(':'),
      r = midiName(root, lang);
    return a[0] === 'chord' ? r + CHORDS[a[1]][0] : r + ' ' + SCALES[a[1]][0];
  }
  function noteList(root, kind, lang) {
    return pitchClasses(root, kind)
      .map(function (p) {
        return midiName(p, lang);
      })
      .join('・');
  }
  // 実際に鳴らすMIDI番号(rootMidiから積む)
  function playNotes(rootMidi, kind) {
    var iv = intervals(kind).slice();
    if (kind.indexOf('scale:') === 0) iv.push(12);
    return iv.map(function (i) {
      return rootMidi + i;
    });
  }
  // PCキーボード: 文字→基準オクターブ先頭Cからの半音数
  var KEYMAP = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
    o: 13,
    l: 14,
    p: 15,
    ';': 16,
  };
  // 曲
  function parseSong(str) {
    return str
      .trim()
      .split(/\s+/)
      .map(function (tok) {
        var p = tok.split(':'),
          m = p[0].match(/^([A-G])(#?)(\d)$/),
          i = EN.indexOf(m[1] + m[2]);
        return { midi: (+m[3] + 1) * 12 + i, beats: p[1] ? +p[1] : 1 };
      });
  }
  var SONGS = [
    {
      id: 'twinkle',
      name: 'きらきら星',
      data: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
    },
    {
      id: 'frog',
      name: 'かえるの合唱',
      data: 'C4 D4 E4 F4 E4 D4 C4:2 E4 F4 G4 A4 G4 F4 E4:2 C4:2 C4:2 C4:0.5 C4:0.5 D4:0.5 D4:0.5 E4:0.5 E4:0.5 F4:0.5 F4:0.5 E4 D4 C4:2',
    },
    {
      id: 'joy',
      name: '喜びの歌',
      data: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2',
    },
    {
      id: 'mary',
      name: 'メリーさんのひつじ',
      data: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:2',
    },
    {
      id: 'jingle',
      name: 'ジングルベル',
      data: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2',
    },
  ].map(function (s) {
    s.notes = parseSong(s.data);
    return s;
  });
  function songRange(notes) {
    var lo = 999,
      hi = -1;
    notes.forEach(function (n) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    });
    return { lo: lo, hi: hi };
  }
  // 曲が収まる開始オクターブ(収まらない場合はoctavesを増やす必要あり→null)
  function fitOctave(lo, hi, octaves, cur) {
    function ok(b) {
      var s = (b + 1) * 12;
      return lo >= s && hi < s + octaves * 12;
    }
    if (ok(cur)) return cur;
    for (var d = 1; d <= 8; d++) {
      if (ok(cur - d)) return cur - d;
      if (ok(cur + d)) return cur + d;
    }
    return null;
  }
  // 練習の進行管理
  function createPractice(notes) {
    var i = 0;
    return {
      expected: function () {
        return i < notes.length ? notes[i].midi : null;
      },
      index: function () {
        return i;
      },
      length: function () {
        return notes.length;
      },
      done: function () {
        return i >= notes.length;
      },
      press: function (m) {
        if (i >= notes.length) return 'done';
        if (m === notes[i].midi) {
          i++;
          return i >= notes.length ? 'done' : 'hit';
        }
        return 'miss';
      },
      reset: function () {
        i = 0;
      },
    };
  }
  // 録音→標準MIDIファイル(フォーマット0, 120bpm, 480tick/拍)
  function vlq(n) {
    var b = [n & 0x7f];
    n >>= 7;
    while (n > 0) {
      b.unshift((n & 0x7f) | 0x80);
      n >>= 7;
    }
    return b;
  }
  function eventsToMidi(events, prog) {
    var PPQ = 480,
      ev = events.slice().sort(function (a, b) {
        return a.t - b.t || (a.on ? 1 : 0) - (b.on ? 1 : 0);
      });
    var tr = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]; // tempo 500000us
    if (prog !== undefined && prog !== null) tr.push(0, 0xc0, prog & 0x7f);
    var last = 0;
    ev.forEach(function (e) {
      var tick = Math.round((e.t * PPQ) / 500),
        d = Math.max(0, tick - last);
      last = Math.max(last, tick);
      Array.prototype.push.apply(tr, vlq(d));
      tr.push(e.on ? 0x90 : 0x80, e.midi & 0x7f, e.on ? 90 : 0);
    });
    tr.push(0, 0xff, 0x2f, 0);
    var len = tr.length,
      out = [
        0x4d,
        0x54,
        0x68,
        0x64,
        0,
        0,
        0,
        6,
        0,
        0,
        0,
        1,
        PPQ >> 8,
        PPQ & 255,
        0x4d,
        0x54,
        0x72,
        0x6b,
        (len >> 24) & 255,
        (len >> 16) & 255,
        (len >> 8) & 255,
        len & 255,
      ];
    return new Uint8Array(out.concat(tr));
  }
  var api = {
    EN: EN,
    JP: JP,
    noteToFreq: noteToFreq,
    isBlack: isBlack,
    pc: pc,
    midiName: midiName,
    midiFull: midiFull,
    buildLayout: buildLayout,
    CHORDS: CHORDS,
    SCALES: SCALES,
    intervals: intervals,
    pitchClasses: pitchClasses,
    label: label,
    noteList: noteList,
    playNotes: playNotes,
    KEYMAP: KEYMAP,
    parseSong: parseSong,
    SONGS: SONGS,
    songRange: songRange,
    fitOctave: fitOctave,
    createPractice: createPractice,
    eventsToMidi: eventsToMidi,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PianoCore = api;
})();
