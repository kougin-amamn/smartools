/* 重力を画面の左右軸へ投影。縦・横画面、表裏の姿勢に対応する。 */
(function (root) {
  const rad = Math.PI / 180;
  const LevelCore = {
    angle(beta, gamma, rotation) {
      if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
      const x = Math.sin(gamma * rad) * Math.cos(beta * rad);
      const y = Math.sin(beta * rad);
      const across = x * Math.cos(rotation * rad) + y * Math.sin(rotation * rad);
      return Math.asin(Math.max(-1, Math.min(1, across))) / rad;
    },
    difference(angle, baseline) { return angle - baseline; },
    format(angle) {
      const rounded = Math.round(angle * 10) / 10;
      return (rounded > 0 ? '+' : '') + (rounded === 0 ? 0 : rounded).toFixed(1);
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LevelCore;
  else root.LevelCore = LevelCore;
})(typeof window === 'undefined' ? globalThis : window);
