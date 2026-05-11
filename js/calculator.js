// 純函式，無副作用
// 瀏覽器使用全域 WEIGHTS、TIER_DEFAULTS、DEFAULT_MONTHLY_COST（由 config.js 定義）
// Node.js 測試時由測試檔設定 global.*

/**
 * 安全地將值轉為數字，若為 null/undefined/空字串/NaN 則回傳預設值
 */
function safeNum(v, def) {
  const n = Number(v)
  return (v === null || v === undefined || v === '' || isNaN(n)) ? def : n
}

/**
 * 計算問卷總分
 * @param {Object} answers - 各題答案，格式 { q1: 'a', q2: 'b', ... }，未作答傳 null
 * @param {Object} [weights] - 自訂權重表（可選），省略時使用全域 WEIGHTS
 * @returns {number} 總分
 */
function calcScore(answers, weights) {
  const w = weights || WEIGHTS
  let total = 0
  for (const [q, choice] of Object.entries(answers)) {
    if (choice !== null && choice !== undefined && w[q] && w[q][choice] !== undefined) {
      total += w[q][choice]
    }
  }
  return total
}

/**
 * 依分數判斷系統量級
 * @param {number} score
 * @returns {'S'|'M'|'L'|'XL'}
 */
function calcTier(score) {
  if (score <= 25)  return 'S'
  if (score <= 60)  return 'M'
  if (score <= 110) return 'L'
  return 'XL'
}

/**
 * 計算各項費用估算
 * @param {'S'|'M'|'L'|'XL'} tier - 系統量級
 * @param {Object} [overrides] - 覆蓋預設參數（可選），null 值的欄位仍使用預設值
 * @returns {Object} 費用估算結果
 */
function calcCosts(tier, overrides) {
  const d = TIER_DEFAULTS[tier]
  if (!d) return null

  // XL 規模需個別議價，僅回傳雲端費用範圍
  if (tier === 'XL') {
    return { isXL: true, cloudLow: d.cloudLow, cloudHigh: d.cloudHigh }
  }

  const o = overrides || {}
  // 月薪（萬元）
  const mLow  = safeNum(o.monthlyCostLow,       DEFAULT_MONTHLY_COST.low)
  const mHigh = safeNum(o.monthlyCostHigh,       DEFAULT_MONTHLY_COST.high)
  // 建置人月數
  const pmBL  = safeNum(o.buildPersonMonthLow,  d.buildPersonMonthLow)
  const pmBH  = safeNum(o.buildPersonMonthHigh, d.buildPersonMonthHigh)
  // 建置期程（月）
  const durL  = safeNum(o.durationLow,          d.durationLow)
  const durH  = safeNum(o.durationHigh,          d.durationHigh)
  // 維護人月數（每月）
  const pmML  = safeNum(o.maintMonthLow,        d.maintMonthLow)
  const pmMH  = safeNum(o.maintMonthHigh,        d.maintMonthHigh)

  // 建置費（萬元）= 人月 × 期程 × 月薪
  const buildLow  = pmBL * durL * mLow
  const buildHigh = pmBH * durH * mHigh
  const buildMid  = (buildLow + buildHigh) / 2

  // 雲端費（萬元/年，已含緩衝率）
  const cloudLow  = d.cloudLow
  const cloudHigh = d.cloudHigh
  const cloudMid  = (cloudLow + cloudHigh) / 2

  // 維護費（萬元/年）= 人月/月 × 12個月 × 月薪
  const maintLow  = pmML * 12 * mLow
  const maintHigh = pmMH * 12 * mHigh
  const maintMid  = (maintLow + maintHigh) / 2

  // 預備金 = 中間值合計 × 預備金比例
  const reserve = (buildMid + cloudMid + maintMid) * d.contingency

  return {
    isXL: false,
    buildLow, buildHigh, buildMid,
    cloudLow, cloudHigh, cloudMid,
    maintLow, maintHigh, maintMid,
    reserve,
    totalLow:  buildLow  + cloudLow  + maintLow,
    totalHigh: buildHigh + cloudHigh + maintHigh,
  }
}

// 支援 Node.js（測試）與瀏覽器（全域）兩種環境
if (typeof module !== 'undefined') {
  module.exports = { calcScore, calcTier, calcCosts }
}
