/* common/log.js の起動のログ(log.started)。window・performance・console を仮の物にして読み込む */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const a = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../../common/log.js'), 'utf8');

/* log.js を新しく読み込み、出た行と load の合図を返す */
function load() {
  const lines = [],
    listeners = {},
    timers = [];
  const sandbox = {
    console: {
      info: (m) => lines.push(m),
      log: (m) => lines.push(m),
      warn() {},
      error() {},
      debug() {},
    },
    performance: { now: () => 180.4 },
    setTimeout: (f) => timers.push(f),
    Date,
    String,
    window: {
      addEventListener: (type, f) => (listeners[type] = f),
    },
    document: { addEventListener() {} },
  };
  vm.runInNewContext(src, sandbox);
  const fireLoad = () => {
    listeners.load();
    timers.splice(0).forEach((f) => f());
  };
  const startedLines = () =>
    lines.filter((l) => /起動しました/.test(l)).map((l) => l.replace(/^\S+ \S+ /, ''));
  return { log: sandbox.window.log, fireLoad, startedLines };
}

/* 何も呼ばないページは、読み込みが終わった時に自動で出す */
let t = load();
a.deepEqual(t.startedLines(), []);
t.fireLoad();
a.deepEqual(t.startedLines(), ['起動しました(180ms)']);

/* 詳細を渡すと、詳細と時間を並べる。2回目からは出さず、自動でも出さない */
t = load();
t.log.started('音色 ピアノ');
t.log.started('もう一度');
t.fireLoad();
a.deepEqual(t.startedLines(), ['起動しました(音色 ピアノ / 180ms)']);

/* later() の後は自動で出さず、ページが呼んだ時に出す */
t = load();
t.log.started.later();
t.fireLoad();
a.deepEqual(t.startedLines(), []);
t.log.started('ツール 47冊');
a.deepEqual(t.startedLines(), ['起動しました(ツール 47冊 / 180ms)']);

/* 出した後の later() は何もしない */
t = load();
t.log.started();
t.log.started.later();
t.log.started('後から');
a.deepEqual(t.startedLines(), ['起動しました(180ms)']);
