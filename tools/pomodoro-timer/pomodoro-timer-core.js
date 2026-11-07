/* ポモドーロの段階の切り替え(画面・時刻に依存しない。Node でテストできる)。window.PomodoroCore */
(function (root) {
  'use strict';
  var LIMITS = { work: [5, 60], short: [1, 30], long: [5, 60] };
  var LONG_BREAK_EVERY = 4;
  var NAMES = { work: '作業', short: '短い休憩', long: '長い休憩' };
  function formatTime(t) {
    var s = Math.max(0, Math.round(t)),
      m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  /* 次の段階。work を終えるたびに cycle が増え、4回目のあとは長い休憩 */
  function next(mode, cycle) {
    if (mode === 'work') {
      cycle += 1;
      return { mode: cycle >= LONG_BREAK_EVERY ? 'long' : 'short', cycle: cycle };
    }
    if (mode === 'long') cycle = 0;
    return { mode: 'work', cycle: cycle };
  }
  /* 時間の変更(上限・下限で止める)。changed=false なら変えられなかった */
  function step(key, value, delta) {
    var lim = LIMITS[key],
      v = Math.max(lim[0], Math.min(lim[1], value + delta));
    return {
      value: v,
      changed: v !== value,
      limit: v === value ? (delta > 0 ? '上限' : '下限') : null,
    };
  }
  /* 端末の日付(yyyy-mm-dd)。UTC ではなく端末の時刻で日付を切り替える */
  function localDate(d) {
    d = d || new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }
  var api = {
    LIMITS: LIMITS,
    LONG_BREAK_EVERY: LONG_BREAK_EVERY,
    NAMES: NAMES,
    formatTime: formatTime,
    next: next,
    step: step,
    localDate: localDate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PomodoroCore = api;
})(this);
