/* 世界時計の画面に依存しない処理(都市の時刻・時差)。Node でテストできる */
(function () {
  // 都市リスト(IANAタイムゾーン)。端末のIntlを使うので通信不要。
  var CITIES = [
    ['tokyo', '東京', 'Asia/Tokyo'],
    ['seoul', 'ソウル', 'Asia/Seoul'],
    ['beijing', '北京', 'Asia/Shanghai'],
    ['hongkong', '香港', 'Asia/Hong_Kong'],
    ['taipei', '台北', 'Asia/Taipei'],
    ['singapore', 'シンガポール', 'Asia/Singapore'],
    ['bangkok', 'バンコク', 'Asia/Bangkok'],
    ['jakarta', 'ジャカルタ', 'Asia/Jakarta'],
    ['manila', 'マニラ', 'Asia/Manila'],
    ['hanoi', 'ハノイ', 'Asia/Ho_Chi_Minh'],
    ['delhi', 'デリー', 'Asia/Kolkata'],
    ['dhaka', 'ダッカ', 'Asia/Dhaka'],
    ['dubai', 'ドバイ', 'Asia/Dubai'],
    ['tehran', 'テヘラン', 'Asia/Tehran'],
    ['istanbul', 'イスタンブール', 'Europe/Istanbul'],
    ['moscow', 'モスクワ', 'Europe/Moscow'],
    ['cairo', 'カイロ', 'Africa/Cairo'],
    ['nairobi', 'ナイロビ', 'Africa/Nairobi'],
    ['johannesburg', 'ヨハネスブルグ', 'Africa/Johannesburg'],
    ['lagos', 'ラゴス', 'Africa/Lagos'],
    ['london', 'ロンドン', 'Europe/London'],
    ['paris', 'パリ', 'Europe/Paris'],
    ['berlin', 'ベルリン', 'Europe/Berlin'],
    ['rome', 'ローマ', 'Europe/Rome'],
    ['madrid', 'マドリード', 'Europe/Madrid'],
    ['athens', 'アテネ', 'Europe/Athens'],
    ['helsinki', 'ヘルシンキ', 'Europe/Helsinki'],
    ['reykjavik', 'レイキャビク', 'Atlantic/Reykjavik'],
    ['newyork', 'ニューヨーク', 'America/New_York'],
    ['chicago', 'シカゴ', 'America/Chicago'],
    ['denver', 'デンバー', 'America/Denver'],
    ['losangeles', 'ロサンゼルス', 'America/Los_Angeles'],
    ['anchorage', 'アンカレッジ', 'America/Anchorage'],
    ['honolulu', 'ホノルル', 'Pacific/Honolulu'],
    ['mexico', 'メキシコシティ', 'America/Mexico_City'],
    ['toronto', 'トロント', 'America/Toronto'],
    ['saopaulo', 'サンパウロ', 'America/Sao_Paulo'],
    ['buenosaires', 'ブエノスアイレス', 'America/Argentina/Buenos_Aires'],
    ['sydney', 'シドニー', 'Australia/Sydney'],
    ['perth', 'パース', 'Australia/Perth'],
    ['auckland', 'オークランド', 'Pacific/Auckland'],
    ['utc', '協定世界時(UTC)', 'UTC'],
  ].map(function (a) {
    return { id: a[0], name: a[1], tz: a[2] };
  });

  var fmtCache = {};
  function fmt(tz) {
    if (!fmtCache[tz])
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
      });
    return fmtCache[tz];
  }
  var WD = ['日', '月', '火', '水', '木', '金', '土'],
    WDEN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function parts(date, tz) {
    var o = {};
    fmt(tz)
      .formatToParts(date)
      .forEach(function (p) {
        o[p.type] = p.value;
      });
    return {
      y: +o.year,
      mo: +o.month,
      d: +o.day,
      h: +o.hour % 24,
      mi: +o.minute,
      s: +o.second,
      wd: WDEN[o.weekday],
    };
  }
  // そのタイムゾーンのUTCからのずれ(分)
  function offsetMin(date, tz) {
    var p = parts(date, tz);
    var asUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }
  function dayNum(p) {
    return Math.floor(Date.UTC(p.y, p.mo - 1, p.d) / 86400000);
  }
  // 基準タイムゾーン(端末)から見た日付差: -1,0,1
  function dayDiff(date, tz, baseTz) {
    return dayNum(parts(date, tz)) - dayNum(parts(date, baseTz));
  }
  function dayLabel(n) {
    return n < 0 ? '昨日' : n > 0 ? '明日' : '今日';
  }
  // 基準との時差ラベル 例: "+9時間" "-13時間" "+5時間30分" "±0"
  function diffLabel(date, tz, baseTz) {
    var m = offsetMin(date, tz) - offsetMin(date, baseTz);
    if (m === 0) return '時差なし';
    var s = m > 0 ? '+' : '-',
      a = Math.abs(m),
      h = Math.floor(a / 60),
      mm = a % 60;
    return s + h + '時間' + (mm ? mm + '分' : '');
  }
  function utcLabel(date, tz) {
    var m = offsetMin(date, tz),
      s = m < 0 ? '-' : '+',
      a = Math.abs(m);
    return 'UTC' + s + Math.floor(a / 60) + (a % 60 ? ':' + ('0' + (a % 60)).slice(-2) : '');
  }
  function pad(n) {
    return ('0' + n).slice(-2);
  }
  function timeText(p, h12, showSec) {
    var h = p.h,
      suf = '';
    if (h12) {
      suf = h < 12 ? '午前 ' : '午後 ';
      h = h % 12;
      if (h === 0) h = 12;
    }
    return { pre: suf, hm: (h12 ? h : pad(h)) + ':' + pad(p.mi), sec: pad(p.s) };
  }
  function dateText(p) {
    return p.mo + '月' + p.d + '日(' + WD[p.wd] + ')';
  }
  function isDay(p) {
    return p.h >= 6 && p.h < 18;
  }
  var api = {
    CITIES: CITIES,
    parts: parts,
    offsetMin: offsetMin,
    dayDiff: dayDiff,
    dayLabel: dayLabel,
    diffLabel: diffLabel,
    utcLabel: utcLabel,
    timeText: timeText,
    dateText: dateText,
    isDay: isDay,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorldClockCore = api;
})();
