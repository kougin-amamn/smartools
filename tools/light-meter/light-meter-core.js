/* 照度計の計算(画面に依存せず Node でテストできる)。カメラ映像の明るさと露出から lx の目安を求める */
(function (root) {
  'use strict';

  /* 補正値の初期値。一般的なスマホで、事務所(約500lx)の時の映像・露出から求めたおおよその値。端末ごとに大きく違うので、
     基準の明るさに合わせて補正して使う */
  var DEFAULT_CAL = 15000;
  var CAL_MIN = 100,
    CAL_MAX = 1e7;

  /* 映像の画素値(0〜255)を、光の量に比例する値(0〜1)に戻す。ガンマは 2.2 とみなす */
  function linear(avg255) {
    return Math.pow(Math.max(0, Math.min(255, avg255)) / 255, 2.2);
  }

  /* 露出から求める「場面の明るさ」の値。映像の明るさは (場面の明るさ × 露出時間 × ISO感度) に比例するので、
     その逆をとって露出の影響を取り除く。露出時間(exposureTime)はカメラの設定値で、単位は 100 マイクロ秒。
     値が読めない時は null */
  function sceneValue(avg255, exposureUnits, iso) {
    var t = Number(exposureUnits) * 1e-4,
      s = Number(iso);
    if (!(t > 0) || !(s > 0)) return null;
    return linear(avg255) / (t * s);
  }

  function estimateLux(sv, cal) {
    return sv * cal;
  }

  /* 今の場面の値 sv が、基準の照度 refLux になるような補正値を返す */
  function calibrate(refLux, sv) {
    if (!(refLux > 0) || !(sv > 0)) return null;
    return Math.max(CAL_MIN, Math.min(CAL_MAX, refLux / sv));
  }

  var api = {
    DEFAULT_CAL: DEFAULT_CAL,
    linear: linear,
    sceneValue: sceneValue,
    estimateLux: estimateLux,
    calibrate: calibrate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LightCore = api;
})(this);
