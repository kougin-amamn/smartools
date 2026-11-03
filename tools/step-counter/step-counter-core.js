/* 歩数の検出(画面・センサーに依存しない。Node でテストできる)。window.StepCounterCore
   加速度の大きさをなめらかにした値との差が threshold を上に超えた瞬間を1歩と数える(最短 minInterval ms ごと) */
(function (root) {
  'use strict';
  var STEP_LENGTH_M = 0.7; /* 歩幅の概算(70cm) */
  var KCAL_PER_STEP = 0.04; /* 1歩あたりの消費カロリー概算(体重60kg想定の目安値) */
  function createStepCounter(opts) {
    opts = opts || {};
    var threshold = opts.threshold || 1.2,
      minInterval = opts.minInterval || 250;
    var smoothed = 9.8,
      lastStepTime = -Infinity,
      wasAbove = false,
      stepCount = 0;
    function addSample(ax, ay, az, t) {
      var magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
      smoothed = smoothed * 0.9 + magnitude * 0.1;
      var isAbove = magnitude - smoothed > threshold;
      if (isAbove && !wasAbove && t - lastStepTime > minInterval) {
        stepCount++;
        lastStepTime = t;
      }
      wasAbove = isAbove;
      return stepCount;
    }
    return {
      addSample: addSample,
      getCount: function () {
        return stepCount;
      },
      setCount: function (n) {
        stepCount = n;
      },
    };
  }
  function distanceKm(steps) {
    return (steps * STEP_LENGTH_M) / 1000;
  }
  function kcal(steps) {
    return Math.round(steps * KCAL_PER_STEP);
  }
  var api = {
    createStepCounter: createStepCounter,
    distanceKm: distanceKm,
    kcal: kcal,
    STEP_LENGTH_M: STEP_LENGTH_M,
    KCAL_PER_STEP: KCAL_PER_STEP,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StepCounterCore = api;
})(this);
