/* 頭痛予報の計算(画面に依存しない。Node でテストできる)。気圧の下がり方から1時間ごとの注意の段階を出す。window.HeadacheForecastCore */
(function (root) {
  'use strict';
  /* 段階の目安(hPa)。3時間で下がった量か、24時間で下がった量のどちらかが超えたらその段階にする */
  var THRESHOLDS = {
    caution: { drop3: 1.5, drop24: 6 },
    warning: { drop3: 3, drop24: 10 },
  };
  /* 感じやすさ。目安の値に掛ける(敏感なほど小さな下がり方で知らせる) */
  var SENSITIVITY_FACTORS = { high: 0.7, normal: 1, low: 1.4 };
  var LEVEL_NAMES = ['安心', '注意', '警戒'];
  var MAX_RECORDS = 200;

  /* i 時間目までの hours 時間で下がった量(上がった時はマイナス)。前のデータが無い時は null */
  function dropOf(pressures, i, hours) {
    var before = pressures[i - hours];
    var now = pressures[i];
    if (before == null || now == null) return null;
    return Math.round((before - now) * 10) / 10;
  }

  function levelOf(drop3, drop24, sensitivity) {
    var factor = SENSITIVITY_FACTORS[sensitivity] || 1;
    function over(limit) {
      return (
        (drop3 != null && drop3 >= limit.drop3 * factor) ||
        (drop24 != null && drop24 >= limit.drop24 * factor)
      );
    }
    if (over(THRESHOLDS.warning)) return 2;
    if (over(THRESHOLDS.caution)) return 1;
    return 0;
  }

  /* times は Unix 時刻(秒)、pressures は hPa。1時間ごとの段階の一覧を返す */
  function hourlyLevelsOf(times, pressures, sensitivity) {
    return times.map(function (time, i) {
      var drop3 = dropOf(pressures, i, 3);
      var drop24 = dropOf(pressures, i, 24);
      return {
        time: time * 1000,
        pressure: pressures[i],
        drop3: drop3,
        drop24: drop24,
        level: pressures[i] == null ? 0 : levelOf(drop3, drop24, sensitivity),
      };
    });
  }

  /* 時刻 ms にいちばん近い時間の番号(範囲の外なら -1) */
  function indexAt(hours, ms) {
    if (!hours.length) return -1;
    var first = hours[0].time;
    var last = hours[hours.length - 1].time;
    if (ms < first - 30 * 60 * 1000 || ms > last + 30 * 60 * 1000) return -1;
    var best = 0;
    hours.forEach(function (h, i) {
      if (Math.abs(h.time - ms) < Math.abs(hours[best].time - ms)) best = i;
    });
    return best;
  }

  /* 注意以上が続く時間のまとまり。from から to まで(時刻 ms)を見る */
  function periodsOf(hours, from, to) {
    var periods = [];
    var current = null;
    hours.forEach(function (h) {
      if (h.time < from || h.time > to) return;
      if (h.level >= 1) {
        if (!current) {
          current = { start: h.time, end: h.time, level: h.level, maxDrop3: h.drop3 || 0 };
          periods.push(current);
        }
        current.end = h.time;
        current.level = Math.max(current.level, h.level);
        current.maxDrop3 = Math.max(current.maxDrop3, h.drop3 || 0);
      } else {
        current = null;
      }
    });
    return periods;
  }

  /* 今から 24 時間の見通し: いちばん高い段階と、最初に注意以上になる時刻 */
  function outlookOf(hours, now) {
    var nowIndex = indexAt(hours, now);
    var periods = periodsOf(hours, now - 30 * 60 * 1000, now + 24 * 3600 * 1000);
    var maxLevel = periods.reduce(function (m, p) {
      return Math.max(m, p.level);
    }, 0);
    return {
      now: nowIndex >= 0 ? hours[nowIndex] : null,
      maxLevel: maxLevel,
      firstStart: periods.length ? periods[0].start : null,
      periods: periods,
    };
  }

  /* 記録を足す(新しい順。上限を超えたら古い物から消す) */
  function addRecord(records, ms, max) {
    var list = [{ time: ms }].concat(Array.isArray(records) ? records : []);
    return list.slice(0, max || MAX_RECORDS);
  }

  /* 記録した時の気圧の変化。データの範囲にある記録だけ数え、注意以上だった数も返す */
  function recordStatsOf(records, hours) {
    var matched = 0;
    var inCaution = 0;
    var rows = (records || []).map(function (r) {
      var i = indexAt(hours, r.time);
      var h = i >= 0 ? hours[i] : null;
      if (h) {
        matched++;
        if (h.level >= 1) inCaution++;
      }
      return { time: r.time, hour: h };
    });
    return { rows: rows, matched: matched, inCaution: inCaution };
  }

  var api = {
    THRESHOLDS: THRESHOLDS,
    SENSITIVITY_FACTORS: SENSITIVITY_FACTORS,
    LEVEL_NAMES: LEVEL_NAMES,
    MAX_RECORDS: MAX_RECORDS,
    dropOf: dropOf,
    levelOf: levelOf,
    hourlyLevelsOf: hourlyLevelsOf,
    indexAt: indexAt,
    periodsOf: periodsOf,
    outlookOf: outlookOf,
    addRecord: addRecord,
    recordStatsOf: recordStatsOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.HeadacheForecastCore = api;
})(this);
