/* tools/dj-turntable-pro の計算・盤の音(worklet)・解析(BPM) */
const C = require('../../tools/dj-turntable-pro/dj-turntable-pro-core.js');
const { Deck } = require('../../common/turntable-worklet.js');
const { analyze } = require('../../tools/dj-turntable-pro/dj-turntable-pro-analysis.js');
const a = require('assert');
const near = (x, y, e, what) => a.ok(Math.abs(x - y) <= e, what + ': ' + x + ' (期待 ' + y + ')');

/* アームの角度と針の位置: 外の溝 → 内の溝、行って戻せる */
const P = C.PLINTH;
[0, 0.5, 1].forEach((p) =>
  near(C.progressOfArmAngle(C.armAngleOf(p)), p, 1e-6, 'アームの往復 ' + p),
);
a.equal(C.progressOfArmAngle(P.restAngle), null);
a.ok(C.armAngleOf(1) > C.armAngleOf(0));

a.equal(C.speedOf(100 / 3, 0), 1);
near(C.speedOf(45, 8), 1.458, 1e-6, '45回転 +8%');
a.equal(C.pitchOfFader(0.01, 8), 0);
a.equal(C.pitchOfFader(-1, 16), -16);
a.equal(C.unwrapDegrees(350), -10);

/* クロスフェーダー: なめらかは中央で等パワー、スクラッチは端で一気に */
near(C.crossfaderGainsOf(0.5, 'smooth').a, Math.SQRT1_2, 1e-9, 'なめらか 中央');
a.deepStrictEqual(C.crossfaderGainsOf(0.5, 'scratch'), { a: 1, b: 1 });
a.equal(C.crossfaderGainsOf(0, 'scratch').b, 0);
a.equal(C.crossfaderGainsOf(0.02, 'scratch').b, 0.5);
a.equal(C.isolatorGainOf(-1), 0);
a.equal(C.isolatorGainOf(1), 2);
a.equal(C.filterOf(0).frequency, 22000);
a.equal(C.filterOf(-1).type, 'lowpass');
near(C.filterOf(1).frequency, 6000, 1e-6, 'ハイパス 右いっぱい');

/* ストロボ: 標準の速さと止まっている時は止まって見え、1% 速いと 2度/秒 流れる */
near(C.strobeDriftOf(1), 0, 1e-9, 'ストロボ 0%');
near(C.strobeDriftOf(0), 0, 1e-9, 'ストロボ 停止');
near(C.strobeDriftOf(1.01), 2, 1e-6, 'ストロボ +1%');

const beats = C.beatsBetween(120, 0.25, 0, 2.1);
a.deepStrictEqual(
  beats.map((b) => b.time),
  [0.25, 0.75, 1.25, 1.75],
);
a.ok(beats[0].isBar && !beats[1].isBar);
a.equal(C.formatTime(252.9), '4:12');
a.equal(C.formatPitch(2.34), '+2.3%');
a.equal(C.formatPitch(0), '0.0%');
a.equal(C.titleOf('曲.mp3'), '曲');
a.equal(C.trackKeyOf('a.mp3', 10, 1.23), 'a.mp3|10|12');
a.deepStrictEqual(
  Object.keys(C.pruneTracks({ a: { used: 1 }, b: { used: 3 }, c: { used: 2 } }, 2)),
  ['b', 'c'],
);

/* 盤の音: 1秒の 440Hz を Int16 で */
const RATE = 48000;
function tone(seconds) {
  const d = new Int16Array(RATE * seconds);
  for (let i = 0; i < d.length; i++)
    d[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * 16000);
  return d;
}
function run(deck, seconds, now) {
  const L = new Float32Array(128),
    R = new Float32Array(128);
  let t = now || 0,
    rms = 0,
    count = 0;
  for (let n = 0; n < Math.round((seconds * RATE) / 128); n++) {
    deck.process(L, R, 128, t);
    t += 128 / RATE;
    for (let i = 0; i < 128; i++) rms += L[i] * L[i];
    count += 128;
  }
  return { time: t, rms: Math.sqrt(rms / count) };
}

/* モーター: 起動 0.7秒で標準の速さに届き、補間した音が出る */
let d = new Deck(RATE);
d.load(tone(10), null, RATE);
d.motorOn = true;
run(d, 0.35);
near(d.speed, 0.5, 0.02, '起動の途中');
const started = run(d, 0.4);
near(d.speed, 1, 1e-9, '0.7秒で標準の速さ');
near(started.rms, 16000 / 32768 / Math.SQRT2, 0.01, '補間した音の大きさ');

/* 止める: ブレーキ 0.6秒、止まったら無音 */
d.motorOn = false;
run(d, 0.65);
a.equal(d.speed, 0);
a.equal(run(d, 0.1).rms, 0);

/* 指: 押さえて止めると位置で止まり、1周(360度 = 1.8秒分)回すとその分だけ進む */
d = new Deck(RATE);
d.load(tone(10), null, RATE);
d.motorOn = true;
d.platter = d.speed = 1;
d.touch(true, 0, 0, 0);
let clock = 0;
for (let k = 1; k <= 60; k++) {
  clock = run(d, 1 / 60, clock).time;
  d.touch(true, (360 * k) / 60, k / 60, clock);
}
const afterTurn = d.seconds();
for (let k = 1; k <= 12; k++) {
  clock = run(d, 1 / 60, clock).time;
  d.touch(true, 360, 1 + k / 60, clock);
}
near(d.seconds(), 1.8, 0.005, '押さえた指の位置で止まる(1周 = 1.8秒)');
near(Math.abs(d.speed), 0, 0.01, '押さえている時の速さ');

/* 離す: スリップマットの摩擦(10/秒²)で 0.1秒ほどで標準の速さへ戻る */
d.touch(false, 360, 1.3, clock);
clock = run(d, 0.15, clock).time;
near(d.speed, 1, 1e-9, '離した後の戻り');

/* 回している間も、指から 20ms 以上遅れない(360度/秒 = 標準の速さ) */
near(afterTurn, 1.8, 0.02 * 1, '回している間の遅れ');

/* 曲の終わりでモーターが止まり、知らせる */
d = new Deck(RATE);
d.load(tone(1), null, RATE);
d.seek(0.99, 'start');
const L = new Float32Array(128);
let ended = false;
for (let k = 0; k < 10 && !ended; k++) ended = d.process(L, L, 128, 0);
a.ok(ended && !d.motorOn, '曲の終わり');

/* BPM: 120 BPM の低い打音(60ms の 60Hz)を 30秒、11,025Hz で */
function beatsTrack(bpm, seconds, rate) {
  const m = new Float32Array(Math.round(seconds * rate));
  const period = (60 / bpm) * rate;
  for (let b = 0.1 * rate; b < m.length; b += period) {
    for (let i = 0; i < 0.06 * rate && b + i < m.length; i++) {
      m[Math.floor(b + i)] +=
        Math.sin((2 * Math.PI * 60 * i) / rate) * Math.exp(-i / (0.02 * rate)) * 0.8;
    }
  }
  for (let i = 0; i < m.length; i++) m[i] += Math.sin((2 * Math.PI * 3000 * i) / rate) * 0.05;
  return m;
}
let r = analyze(beatsTrack(120, 30, 11025), 11025);
near(r.bpm, 120, 0.1, 'BPM 120');
near(r.firstBeat % 0.5, 0.1, 0.02, '最初の拍');
a.equal(r.points.length, Math.floor(30 * 150) * 4);
r = analyze(beatsTrack(128, 30, 11025), 11025);
near(r.bpm, 128, 0.1, 'BPM 128');
r = analyze(beatsTrack(87, 30, 11025), 11025);
near(r.bpm, 174, 0.1, 'BPM 87 は倍の 174 に寄せる');

/* 無音の区間 */
const quiet = beatsTrack(120, 12, 11025);
quiet.fill(0, 4 * 11025, 7 * 11025);
r = analyze(quiet, 11025);
a.equal(r.silences.length, 1);
near(r.silences[0][0], 4, 0.05, '無音の始まり');
