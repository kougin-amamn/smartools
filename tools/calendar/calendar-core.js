/* カレンダーの暦の計算(画面に依存しない。Node でテストできる)。window.CalendarCore
   旧暦(天保暦の決まりで、朔と中気から月を決める)・六曜・二十四節気・月の満ち欠け・国民の祝日・干支・一粒万倍日・天赦日。
   天体の位置は Meeus『Astronomical Algorithms』の式(太陽は第25章、朔は第49章、月の黄経は第47章の主な項) */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180,
    JST = 9 / 24;

  /* 日付の通し番号(ユリウス日の整数部。正午を境にしない暦日の番号) */
  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12),
      yy = y + 4800 - a,
      mm = m + 12 * a - 3;
    return (
      d +
      Math.floor((153 * mm + 2) / 5) +
      365 * yy +
      Math.floor(yy / 4) -
      Math.floor(yy / 100) +
      Math.floor(yy / 400) -
      32045
    );
  }
  function fromJdn(n) {
    var a = n + 32044,
      b = Math.floor((4 * a + 3) / 146097),
      c = a - Math.floor((146097 * b) / 4),
      d = Math.floor((4 * c + 3) / 1461),
      e = c - Math.floor((1461 * d) / 4),
      m = Math.floor((5 * e + 2) / 153);
    return {
      y: 100 * b + d - 4800 + Math.floor(m / 10),
      m: m + 3 - 12 * Math.floor(m / 10),
      d: e - Math.floor((153 * m + 2) / 5) + 1,
    };
  }
  function weekday(n) {
    return (n + 1) % 7; /* 0=日曜 */
  }
  /* ΔT(地球の自転の遅れ。秒)。NASA の 2005〜2050年の近似式を前後にもそのまま使う */
  function deltaT(y) {
    var t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  /* 天文の時刻(力学時のユリウス日 JDE)を、日本時間の暦日の番号にする */
  function jdeToJstDay(jde) {
    var y = 2000 + (jde - 2451545) / 365.25;
    return Math.floor(jde - deltaT(y) / 86400 + JST + 0.5);
  }
  function norm(a) {
    a %= 360;
    return a < 0 ? a + 360 : a;
  }

  /* 太陽の視黄経(度)。精度は 0.01度ほど(時刻にして15分ほど) */
  function sunLongitude(jde) {
    var T = (jde - 2451545) / 36525,
      L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T,
      M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * RAD,
      C =
        (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
        (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
        0.000289 * Math.sin(3 * M),
      om = (125.04 - 1934.136 * T) * RAD;
    return norm(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  }
  /* 月の視黄経(度)。主な項だけで、精度は 0.05度ほど(上弦・満月・下弦の日を決めるのに使う) */
  function moonLongitude(jde) {
    var T = (jde - 2451545) / 36525,
      L = 218.3164477 + 481267.88123421 * T,
      D = (297.8501921 + 445267.1114034 * T) * RAD,
      M = (357.5291092 + 35999.0502909 * T) * RAD,
      Mp = (134.9633964 + 477198.8675055 * T) * RAD,
      F = (93.272095 + 483202.0175233 * T) * RAD,
      E = 1 - 0.002516 * T,
      s =
        6.288774 * Math.sin(Mp) +
        1.274027 * Math.sin(2 * D - Mp) +
        0.658314 * Math.sin(2 * D) +
        0.213618 * Math.sin(2 * Mp) -
        0.185116 * E * Math.sin(M) -
        0.114332 * Math.sin(2 * F) +
        0.058793 * Math.sin(2 * D - 2 * Mp) +
        0.057066 * E * Math.sin(2 * D - M - Mp) +
        0.053322 * Math.sin(2 * D + Mp) +
        0.045758 * E * Math.sin(2 * D - M) -
        0.040923 * E * Math.sin(M - Mp) -
        0.03472 * Math.sin(D) -
        0.030383 * E * Math.sin(M + Mp) +
        0.015327 * Math.sin(2 * D - 2 * F) -
        0.012528 * Math.sin(Mp + 2 * F) +
        0.01098 * Math.sin(Mp - 2 * F) +
        0.010675 * Math.sin(4 * D - Mp) +
        0.010034 * Math.sin(3 * Mp) +
        0.008548 * Math.sin(4 * D - 2 * Mp) -
        0.007888 * E * Math.sin(2 * D + M - Mp) -
        0.006766 * E * Math.sin(2 * D + M) -
        0.005163 * Math.sin(D - Mp) +
        0.004987 * E * Math.sin(D + M) +
        0.004036 * E * Math.sin(2 * D - M + Mp);
    return norm(L + s);
  }

  /* k 番目の朔(新月)の時刻 JDE。k=0 が 2000年1月6日。精度は数十秒 */
  function newMoon(k) {
    var T = k / 1236.85,
      T2 = T * T,
      T3 = T2 * T,
      jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T2 * T2,
      E = 1 - 0.002516 * T - 0.0000074 * T2,
      M = (2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD,
      Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T2 * T2) * RAD,
      F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T2 * T2) * RAD,
      O = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD,
      sin = Math.sin;
    jde +=
      -0.4072 * sin(Mp) +
      0.17241 * E * sin(M) +
      0.01608 * sin(2 * Mp) +
      0.01039 * sin(2 * F) +
      0.00739 * E * sin(Mp - M) -
      0.00514 * E * sin(Mp + M) +
      0.00208 * E * E * sin(2 * M) -
      0.00111 * sin(Mp - 2 * F) -
      0.00057 * sin(Mp + 2 * F) +
      0.00056 * E * sin(2 * Mp + M) -
      0.00042 * sin(3 * Mp) +
      0.00042 * E * sin(M + 2 * F) +
      0.00038 * E * sin(M - 2 * F) -
      0.00024 * E * sin(2 * Mp - M) -
      0.00017 * sin(O) -
      0.00007 * sin(Mp + 2 * M) +
      0.00004 * sin(2 * Mp - 2 * F) +
      0.00004 * sin(3 * M) +
      0.00003 * sin(Mp + M - 2 * F) +
      0.00003 * sin(2 * Mp + 2 * F) -
      0.00003 * sin(Mp + M + 2 * F) +
      0.00003 * sin(Mp - M + 2 * F) -
      0.00002 * sin(Mp - M - 2 * F) -
      0.00002 * sin(3 * Mp + M) +
      0.00002 * sin(4 * Mp);
    /* 惑星による小さな補正 */
    [
      [299.77, 0.107408, 0.000325],
      [251.88, 0.016321, 0.000165],
      [251.83, 26.651886, 0.000164],
      [349.42, 36.412478, 0.000126],
      [84.66, 18.206239, 0.00011],
      [141.74, 53.303771, 0.000062],
      [207.14, 2.453732, 0.00006],
      [154.84, 7.30686, 0.000056],
      [34.52, 27.261239, 0.000047],
      [207.19, 0.121824, 0.000042],
      [291.34, 1.844379, 0.00004],
      [161.72, 24.198154, 0.000037],
      [239.56, 25.513099, 0.000035],
      [331.55, 3.592518, 0.000023],
    ].forEach(function (a, i) {
      var arg = a[0] + a[1] * k - (i === 0 ? 0.009173 * T2 : 0);
      jde += a[2] * sin(arg * RAD);
    });
    return jde;
  }
  /* 日本時間の暦日 day を含む(またはそれより前の最後の)朔の番号 */
  function newMoonIndexOnOrBefore(day) {
    var k = Math.floor((day - 2451550) / 29.530588861) + 1;
    while (jdeToJstDay(newMoon(k)) > day) k--;
    while (jdeToJstDay(newMoon(k + 1)) <= day) k++;
    return k;
  }

  /* 太陽の視黄経が lon 度になる時刻 JDE(guess の近くを探す) */
  function solarTermJde(lon, guess) {
    var jde = guess;
    for (var i = 0; i < 20; i++) {
      var d = norm(lon - sunLongitude(jde) + 180) - 180;
      jde += (d * 365.2422) / 360;
      if (Math.abs(d) < 1e-7) break;
    }
    return jde;
  }
  /* y 年の、太陽黄経が lon 度になる日(日本時間の暦日の番号) */
  function solarTermDay(y, lon) {
    /* 春分(0度)を3月20日あたりとして、黄経から日数の見当をつける */
    var guess = jdn(y, 3, 20) + (norm(lon) / 360) * 365.2422;
    if (lon >= 285) guess -= 365.2422; /* 小寒・大寒・立春・雨水・啓蟄はその年の1〜3月 */
    return jdeToJstDay(solarTermJde(lon, guess));
  }

  var SEKKI = [
    '春分',
    '清明',
    '穀雨',
    '立夏',
    '小満',
    '芒種',
    '夏至',
    '小暑',
    '大暑',
    '立秋',
    '処暑',
    '白露',
    '秋分',
    '寒露',
    '霜降',
    '立冬',
    '小雪',
    '大雪',
    '冬至',
    '小寒',
    '大寒',
    '立春',
    '雨水',
    '啓蟄',
  ];
  /* y 年の二十四節気 { 日の番号: 名前 } */
  function sekkiOfYear(y) {
    var out = {};
    for (var i = 0; i < 24; i++) out[solarTermDay(y, i * 15)] = SEKKI[i];
    return out;
  }

  /* 旧暦の月の並び: 冬至を含む月を11月とし、次の冬至を含む月までが13か月なら、
     その間で最初に中気を含まない月を閏月にする(2033年問題も「閏11月」になる、今の一般的な決め方) */
  var monthCache = {};
  function lunarYearMonths(wsYear) {
    if (monthCache[wsYear]) return monthCache[wsYear];
    var ws0 = solarTermDay(wsYear, 270),
      ws1 = solarTermDay(wsYear + 1, 270),
      k0 = newMoonIndexOnOrBefore(ws0),
      k1 = newMoonIndexOnOrBefore(ws1),
      starts = [];
    for (var k = k0; k <= k1 + 1; k++) starts.push(jdeToJstDay(newMoon(k)));
    /* 中気(黄経が30度の倍数)の日の一覧 */
    var chuki = [];
    for (var y = wsYear; y <= wsYear + 1; y++)
      for (var l = 0; l < 360; l += 30) chuki.push(solarTermDay(y, l));
    function hasChuki(i) {
      return chuki.some(function (c) {
        return c >= starts[i] && c < starts[i + 1];
      });
    }
    var n = k1 - k0,
      leapAt = -1;
    if (n === 13)
      for (var i = 1; i < 13; i++)
        if (!hasChuki(i)) {
          leapAt = i;
          break;
        }
    var months = [],
      num = 11;
    for (var j = 0; j < n; j++) {
      var leap = j === leapAt;
      if (j > 0 && !leap) num = (num % 12) + 1;
      months.push({ start: starts[j], end: starts[j + 1], month: num, leap: leap });
    }
    months.wsYear = wsYear;
    return (monthCache[wsYear] = months);
  }
  /* 旧暦の日付 { y, m, d, leap } */
  function lunarDate(day) {
    var g = fromJdn(day),
      list = lunarYearMonths(g.y);
    if (day < list[0].start) list = lunarYearMonths(g.y - 1);
    else if (day >= list[list.length - 1].end) list = lunarYearMonths(g.y + 1);
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (day >= m.start && day < m.end) {
        /* 旧暦の年: 11月・12月は冬至の年、1月から先は次の年 */
        var ly = m.month >= 11 && i < 4 ? list.wsYear : list.wsYear + 1;
        return { y: ly, m: m.month, d: day - m.start + 1, leap: m.leap };
      }
    }
    return null;
  }

  var ROKUYO = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'];
  function rokuyo(lunar) {
    return ROKUYO[(lunar.m + lunar.d) % 6];
  }

  /* 月の満ち欠け: その日のうちに、月と太陽の黄経の差が 0・90・180・270度を通るか */
  var PHASES = ['新月', '上弦', '満月', '下弦'];
  function phaseOn(day) {
    function elong(t) {
      return norm(moonLongitude(t) - sunLongitude(t));
    }
    var y = fromJdn(day).y,
      t0 = day - 0.5 - JST + deltaT(y) / 86400 /* 日本時間の 0時を JDE に */,
      e0 = elong(t0),
      e1 = elong(t0 + 1);
    for (var q = 0; q < 4; q++) {
      var a = q * 90,
        d0 = norm(e0 - a + 180) - 180,
        d1 = norm(e1 - a + 180) - 180;
      if (d0 < 0 && d1 >= 0) return PHASES[q];
    }
    return null;
  }
  /* 月齢(日本時間の正午の値) */
  function moonAge(day) {
    var noon = day - JST + deltaT(fromJdn(day).y) / 86400,
      k = Math.floor((noon - 2451550.09766) / 29.530588861) + 1;
    while (newMoon(k) > noon) k--;
    return noon - newMoon(k);
  }

  /* 国民の祝日(2020年以降の決まり。2020・2021年はオリンピックで移った日も入れる) */
  function nthMonday(y, m, n) {
    var first = weekday(jdn(y, m, 1));
    return jdn(y, m, 1 + ((8 - first) % 7) + (n - 1) * 7);
  }
  var holidayCache = {};
  function holidaysOfYear(y) {
    if (holidayCache[y]) return holidayCache[y];
    var h = {};
    function add(day, name) {
      h[day] = name;
    }
    add(jdn(y, 1, 1), '元日');
    add(nthMonday(y, 1, 2), '成人の日');
    add(jdn(y, 2, 11), '建国記念の日');
    if (y >= 2020) add(jdn(y, 2, 23), '天皇誕生日');
    else if (y <= 2018) add(jdn(y, 12, 23), '天皇誕生日');
    add(solarTermDay(y, 0), '春分の日');
    add(jdn(y, 4, 29), '昭和の日');
    add(jdn(y, 5, 3), '憲法記念日');
    add(jdn(y, 5, 4), 'みどりの日');
    add(jdn(y, 5, 5), 'こどもの日');
    var special = {
      2020: [jdn(2020, 7, 23), jdn(2020, 8, 10), jdn(2020, 7, 24)],
      2021: [jdn(2021, 7, 22), jdn(2021, 8, 8), jdn(2021, 7, 23)],
    }[y];
    add(special ? special[0] : nthMonday(y, 7, 3), '海の日');
    add(special ? special[1] : jdn(y, 8, 11), '山の日');
    add(nthMonday(y, 9, 3), '敬老の日');
    add(solarTermDay(y, 180), '秋分の日');
    add(special ? special[2] : nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
    add(jdn(y, 11, 3), '文化の日');
    add(jdn(y, 11, 23), '勤労感謝の日');
    var base = Object.keys(h)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    /* 振替休日: 祝日が日曜なら、その後の最初の祝日でない日 */
    base.forEach(function (d) {
      if (weekday(d) === 0) {
        var n = d + 1;
        while (h[n]) n++;
        h[n] = '振替休日';
      }
    });
    /* 国民の休日: 前日と翌日が祝日で、その日が祝日でも日曜でもない日 */
    base.forEach(function (d) {
      if (h[d + 2] && !h[d + 1] && weekday(d + 1) !== 0 && h[d] !== '振替休日' && h[d + 2] !== '振替休日')
        h[d + 1] = '国民の休日';
    });
    return (holidayCache[y] = h);
  }

  /* 干支(日)。2000年1月1日が戊午(番号54) */
  var STEMS = '甲乙丙丁戊己庚辛壬癸',
    BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  function kanshiIndex(day) {
    return (((day + 49) % 60) + 60) % 60;
  }
  function kanshi(day) {
    var i = kanshiIndex(day);
    return STEMS[i % 10] + BRANCHES[i % 12];
  }
  /* 節月(立春から寅月=1)。節入りの日はその日から次の月 */
  function setsuMonth(day) {
    var y = fromJdn(day).y,
      jde = day + 0.5 - JST + deltaT(y) / 86400 /* その日の 24時 */,
      lon = sunLongitude(jde);
    return Math.floor(norm(lon - 315) / 30) + 1;
  }
  /* 一粒万倍日: 節月ごとに決まった十二支の日 */
  var MANBAI = [
    null,
    [1, 6],
    [9, 2],
    [0, 3],
    [3, 4],
    [5, 6],
    [9, 6],
    [0, 7],
    [3, 8],
    [9, 6],
    [9, 10],
    [11, 0],
    [3, 0],
  ];
  function isIchiryu(day) {
    return MANBAI[setsuMonth(day)].indexOf(kanshiIndex(day) % 12) >= 0;
  }
  /* 天赦日: 春は戊寅・夏は甲午・秋は戊申・冬は甲子の日 */
  function isTensha(day) {
    var season = Math.floor((setsuMonth(day) - 1) / 3);
    return kanshiIndex(day) === [14, 30, 44, 0][season];
  }

  /* 1日ぶんの情報 */
  function dayInfo(y, m, d) {
    var day = jdn(y, m, d),
      lunar = lunarDate(day);
    return {
      day: day,
      y: y,
      m: m,
      d: d,
      wd: weekday(day),
      holiday: holidaysOfYear(y)[day] || null,
      lunar: lunar,
      rokuyo: rokuyo(lunar),
      sekki: sekkiOfYear(y)[day] || null,
      phase: phaseOn(day),
      age: moonAge(day),
      kanshi: kanshi(day),
      ichiryu: isIchiryu(day),
      tensha: isTensha(day),
    };
  }
  /* 月の表(6週×7日。週の始まり 0=日曜 / 1=月曜) */
  function monthGrid(y, m, weekStart) {
    var first = jdn(y, m, 1),
      lead = (weekday(first) - (weekStart || 0) + 7) % 7,
      start = first - lead,
      cells = [];
    for (var i = 0; i < 42; i++) {
      var g = fromJdn(start + i);
      cells.push({ y: g.y, m: g.m, d: g.d, inMonth: g.m === m });
    }
    return cells;
  }

  var api = {
    jdn: jdn,
    fromJdn: fromJdn,
    weekday: weekday,
    sunLongitude: sunLongitude,
    newMoon: newMoon,
    solarTermDay: solarTermDay,
    sekkiOfYear: sekkiOfYear,
    lunarDate: lunarDate,
    rokuyo: rokuyo,
    phaseOn: phaseOn,
    moonAge: moonAge,
    holidaysOfYear: holidaysOfYear,
    kanshi: kanshi,
    setsuMonth: setsuMonth,
    isIchiryu: isIchiryu,
    isTensha: isTensha,
    dayInfo: dayInfo,
    monthGrid: monthGrid,
    ROKUYO: ROKUYO,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CalendarCore = api;
})(this);
