/* ファイル転送の計算(DOM を使わない)。接続の番号、確認番号、CRC32、圧縮の判断、
   大きさ・速度・残り時間の表示、受け取りの記録 */
(function () {
  'use strict';

  var PREFIX = 'smartools-ft-'; /* 公開サーバーの ID は世界で共有されるため、他のアプリと重ならない前置き */

  /* 6桁の番号。先頭が 0 でも 6 桁で扱う */
  function makeCode(rand) {
    var r = rand || Math.random;
    var s = '';
    for (var i = 0; i < 6; i++) s += Math.floor(r() * 10);
    return s;
  }
  /* 入力や URL の # から番号を取り出す。全角数字・空白・ハイフンも受け付ける。6桁でなければ null */
  function parseCode(text) {
    var s = String(text || '')
      .replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/[\s\-‐ー#]/g, '');
    return /^\d{6}$/.test(s) ? s : null;
  }
  function peerId(code) {
    return PREFIX + code;
  }
  /* 123456 → 123 456(読み上げやすくする) */
  function showCode(code) {
    return code.slice(0, 3) + ' ' + code.slice(3);
  }

  /* 確認番号
     暗号化の鍵の指紋(SDP の a=fingerprint 行)は待ち合わせサーバーを通って交換されるため、サーバーが
     すり替えると間に入れてしまう。両方の端末で同じ指紋の組から同じ4桁を作り、目で見比べて確かめる */
  function fingerprint(sdp) {
    var m = /a=fingerprint:(\S+) ([0-9A-Fa-f:]+)/.exec(sdp || '');
    return m ? m[1].toLowerCase() + ' ' + m[2].toUpperCase() : null;
  }
  /* 自分と相手の指紋を並べ替えて1つの文字列にする(どちらの端末で作っても同じになる) */
  function sasInput(a, b) {
    return [a, b].sort().join('|');
  }
  /* ハッシュの先頭4バイトから4桁 */
  function sasDigits(bytes) {
    var n = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    return ('000' + (n % 10000)).slice(-4);
  }

  /* CRC32。届いたファイルが壊れていないかを確かめる(わざとの改ざんは暗号化と確認番号で防ぐ) */
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  /* state は途中の値(最初は 0)。続けて呼べば分けて渡しても同じ結果になる */
  function crc32(state, bytes) {
    var c = ~state >>> 0;
    for (var i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
  }

  /* 圧縮するか。写真・動画・ZIP などは圧縮済みで縮まず、電池と時間を使うだけなので、文字の多い種類と
     圧縮していない画像・音声(BMP・WAV)だけ */
  var PLAIN_EXT =
    /\.(txt|csv|tsv|json|xml|html?|css|js|mjs|ts|md|log|svg|yaml|yml|ini|conf|sql|py|rb|java|c|cpp|h|go|rs|php|sh|bat|bmp|wav)$/i;
  function shouldCompress(name, type, size) {
    if (size < 1024) return false;
    return (
      /^text\//.test(type || '') || /(json|xml|javascript|svg)/.test(type || '') || PLAIN_EXT.test(name || '')
    );
  }

  /* 再開のための目印。同じファイルを送り直した時に、途中まで受け取った分を使えるようにする */
  function fileKey(name, size, lastModified, enc) {
    return [name, size, lastModified || 0, enc || ''].join('|');
  }

  function bytes(n) {
    if (!(n >= 0)) return '-';
    if (n < 1024) return Math.round(n) + 'B';
    var u = ['KB', 'MB', 'GB', 'TB'],
      i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + u[i];
  }
  function seconds(s) {
    if (!isFinite(s) || s < 0) return '-';
    s = Math.round(s);
    if (s < 60) return s + '秒';
    if (s < 3600) return Math.floor(s / 60) + '分' + (s % 60) + '秒';
    return Math.floor(s / 3600) + '時間' + Math.floor((s % 3600) / 60) + '分';
  }

  /* 直近 windowMs の進み方から速度(バイト/秒)を出す。揺れを抑えるため1点ではなく区間で見る */
  function Speed(windowMs) {
    this.win = windowMs || 3000;
    this.pts = [];
  }
  Speed.prototype.add = function (t, done) {
    this.pts.push([t, done]);
    while (this.pts.length > 2 && t - this.pts[0][0] > this.win) this.pts.shift();
  };
  Speed.prototype.rate = function () {
    var p = this.pts;
    if (p.length < 2) return 0;
    var dt = (p[p.length - 1][0] - p[0][0]) / 1000;
    return dt > 0 ? (p[p.length - 1][1] - p[0][1]) / dt : 0;
  };
  Speed.prototype.reset = function () {
    this.pts = [];
  };
  function eta(rest, rate) {
    return rate > 0 ? rest / rate : Infinity;
  }

  /* 受け取り中の1ファイル。届いた順に部品をためる(1本の順番どおりの通信路なので並べ替えは不要)。
     接続が切れても捨てずに残し、同じ key のファイルが来たら got から続きを受け取る */
  function Receiving(meta) {
    this.key = meta.key;
    this.name = meta.name;
    this.size = meta.size;
    this.enc = meta.enc || '';
    this.type = meta.type || '';
    this.got = 0;
    this.crc = 0;
    this.parts = [];
    this.cancelled = false;
  }
  Receiving.prototype.add = function (buf) {
    if (this.cancelled || this.got + buf.byteLength > this.size) return false;
    this.parts.push(buf);
    this.got += buf.byteLength;
    this.crc = crc32(this.crc, new Uint8Array(buf));
    return true;
  };
  Receiving.prototype.complete = function (crc) {
    return !this.cancelled && this.got === this.size && this.crc === crc;
  };

  /* 制御のメッセージ(JSON の文字列)を確かめる。形がおかしい物は null */
  var TYPES = {
    hello: 1,
    accept: 1,
    reject: 1,
    file: 1,
    ready: 1,
    end: 1,
    done: 1,
    bad: 1,
    blk: 1,
    cancel: 1,
    ping: 1,
    bye: 1,
  };
  function parseMsg(s) {
    if (typeof s !== 'string') return null;
    try {
      var m = JSON.parse(s);
      if (!m || !TYPES[m.t]) return null;
      if (
        m.t === 'file' &&
        !(typeof m.id === 'string' && typeof m.key === 'string' && typeof m.name === 'string' && m.size >= 0)
      )
        return null;
      /* from が -1 なら受け取り済み */
      if (m.t === 'blk' && !(m.n > 0 && m.z >= 0)) return null;
      if (m.t === 'ready' && !(typeof m.id === 'string' && m.from >= -1)) return null;
      return m;
    } catch (e) {
      return null;
    }
  }
  /* 受け取った名前を保存に使える形にする(フォルダの区切りや制御文字を除く) */
  function safeName(name) {
    var s = String(name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .trim()
      .slice(0, 150);
    return s && s !== '.' && s !== '..' ? s : 'file';
  }
  /* 合言葉(再接続の時に、前と同じ相手だと確かめる)。16バイトを16進で */
  function token(bytes) {
    return Array.prototype.map
      .call(bytes, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      })
      .join('');
  }

  var api = {
    makeCode: makeCode,
    parseCode: parseCode,
    peerId: peerId,
    showCode: showCode,
    fingerprint: fingerprint,
    sasInput: sasInput,
    sasDigits: sasDigits,
    crc32: crc32,
    shouldCompress: shouldCompress,
    fileKey: fileKey,
    bytes: bytes,
    seconds: seconds,
    Speed: Speed,
    eta: eta,
    Receiving: Receiving,
    parseMsg: parseMsg,
    safeName: safeName,
    token: token,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TransferCore = api;
})();
