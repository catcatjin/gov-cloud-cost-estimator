// 所有計分權重與量級預設值的單一來源
// 瀏覽器：全域變數；Node.js：module.exports 匯出供測試使用

const WEIGHTS = {
  q1: { a: 5,  b: 10, c: 20, d: 35, e: 50 }, // 使用者規模
  q2: { a: 0,  b: 5,  c: 10, d: 20, e: 35 }, // 年度交易/處理量
  q3: { a: 0,  b: 5,  c: 15, d: 25 },         // 資料機敏等級
  q4: { a: 0,  b: 5,  c: 10, d: 20 },         // 外部系統介接
  q5: { a: 0,  b: 5,  c: 15 },                // 金流處理
  q6: { a: 0,  b: 5,  c: 10, d: 25 },         // 尖峰流量倍率
  q7: { a: 0,  b: 10 },                       // AI 功能
}

// cloudLow/cloudHigh 已含緩衝率，直接使用，不再另乘
const TIER_DEFAULTS = {
  S: {
    buildPersonMonthLow: 1.5, buildPersonMonthHigh: 2,
    durationLow: 3,           durationHigh: 6,
    maintMonthLow: 0.3,       maintMonthHigh: 0.5,
    cloudLow: 3,              cloudHigh: 10,   // 萬/年
    contingency: 0,
  },
  M: {
    buildPersonMonthLow: 3,   buildPersonMonthHigh: 4,
    durationLow: 6,           durationHigh: 12,
    maintMonthLow: 0.5,       maintMonthHigh: 0.7,
    cloudLow: 15,             cloudHigh: 80,
    contingency: 0.10,
  },
  L: {
    buildPersonMonthLow: 6,   buildPersonMonthHigh: 9,
    durationLow: 10,          durationHigh: 18,
    maintMonthLow: 1.0,       maintMonthHigh: 1.5,
    cloudLow: 80,             cloudHigh: 500,
    contingency: 0.15,
  },
  XL: {
    buildPersonMonthLow: null, buildPersonMonthHigh: null,
    durationLow: 12,           durationHigh: 24,
    maintMonthLow: null,       maintMonthHigh: null,
    cloudLow: 500,             cloudHigh: 3000,
    contingency: 0.20,
  },
}

// 人月月薪基準（廠商委外口徑，已含利潤/勞健保/管理費）
const DEFAULT_MONTHLY_COST = { low: 25, high: 35 } // 萬/人月

// Node.js 測試用匯出
if (typeof module !== 'undefined') {
  module.exports = { WEIGHTS, TIER_DEFAULTS, DEFAULT_MONTHLY_COST }
}
