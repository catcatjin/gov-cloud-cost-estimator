// 純函式，無副作用
// 瀏覽器使用全域 WEIGHTS、TIER_DEFAULTS（由 config.js 定義）
// Node.js 測試時由測試檔設定 global.*

/**
 * 安全地將值轉為數字，若為 null/undefined/空字串/NaN 則回傳預設值
 */
function safeNum(v, def) {
  if (def === undefined) def = 0  // def 未傳入時預設為 0，避免 NaN 傳播
  const n = Number(v)
  // 需明確排除 null/undefined/'', 因為 Number(null)===0 會被誤判為有效值
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
 * 計算各項費用估算（角色組成公式）
 * @param {'S'|'M'|'L'|'XL'} tier
 * @param {Object} [overrides] - 覆蓋預設參數（可選）
 *   欄位：pmCount, archCount, engCountLow, engCountHigh,
 *         pmArchSal, engSal, durationLow, durationHigh,
 *         maintMonthLow, maintMonthHigh
 * @returns {Object} 費用估算結果
 */
function calcCosts(tier, overrides) {
  // TIER_DEFAULTS 使用全域變數（與 calcScore 使用全域 WEIGHTS 的模式一致）
  // 測試環境透過 global.TIER_DEFAULTS 注入
  const d = TIER_DEFAULTS[tier]
  if (!d) return null

  // XL 規模需個別議價，僅回傳雲端費用範圍
  if (tier === 'XL') {
    return { isXL: true, cloudLow: d.cloudLow, cloudHigh: d.cloudHigh }
  }

  const o = overrides || {}
  const r = d.roles

  // 角色薪資（萬/人月）
  const pmArchSal = safeNum(o.pmArchSal,    r.pmArchSal)
  const engSal    = safeNum(o.engSal,        r.engSal)

  // 角色人數
  const pmCount   = safeNum(o.pmCount,       r.pm)
  const archCount = safeNum(o.archCount,     r.arch)
  const engLow    = safeNum(o.engCountLow,   r.engLow)
  const engHigh   = safeNum(o.engCountHigh,  r.engHigh)

  // 建置期程（月）
  const durL = safeNum(o.durationLow,  d.durationLow)
  const durH = safeNum(o.durationHigh, d.durationHigh)

  // 維護人月（每月）
  const pmML = safeNum(o.maintMonthLow,  d.maintMonthLow)
  const pmMH = safeNum(o.maintMonthHigh, d.maintMonthHigh)

  // 建置費（萬）= (PM×pmArchSal + Arch×pmArchSal + Eng×engSal) × 期程
  const buildLow  = (pmCount * pmArchSal + archCount * pmArchSal + engLow  * engSal) * durL
  const buildHigh = (pmCount * pmArchSal + archCount * pmArchSal + engHigh * engSal) * durH
  const buildMid  = (buildLow + buildHigh) / 2

  // 雲端費（萬/年，已含緩衝率）
  const cloudLow  = d.cloudLow
  const cloudHigh = d.cloudHigh
  const cloudMid  = (cloudLow + cloudHigh) / 2

  // 維護費（萬/年）= 人月/月 × 12個月 × 工程師月薪
  const maintLow  = pmML * 12 * engSal
  const maintHigh = pmMH * 12 * engSal
  const maintMid  = (maintLow + maintHigh) / 2

  // 預備金 = 中間值合計 × 預備金比例
  const reserve = (buildMid + cloudMid + maintMid) * d.contingency

  return {
    isXL: false,
    buildLow, buildHigh, buildMid,
    // 參考基準（靜態估算）；UI 改用 cloudBreakdown.totalWan，此值僅供 XL 參考或計算 reserve 中間值
    cloudLow, cloudHigh, cloudMid,
    maintLow, maintHigh, maintMid,
    // 預備金中間值估算（基於靜態 cloudMid）；UI 非 XL 顯示改用 app.js adjustedReserve
    reserve,
    // 靜態總費（基於靜態 cloudLow/cloudHigh）；UI 非 XL 顯示改用 app.js adjustedTotalLow/High
    totalLow:  buildLow  + cloudLow  + maintLow,
    totalHigh: buildHigh + cloudHigh + maintHigh,
  }
}

// 以下三個函式為 adjustedReserve/TotalLow/TotalHigh 的純函式版本
// 對應 app.js 的同名 computed，供 app.js 呼叫與測試共用

function calcAdjustedReserve(buildMid, cloudWan, maintMid, rate) {
  return (buildMid + cloudWan + maintMid) * rate
}

function calcAdjustedTotalLow(buildLow, cloudWan, maintLow, reserve) {
  return buildLow + cloudWan + maintLow + reserve
}

function calcAdjustedTotalHigh(buildHigh, cloudWan, maintHigh, reserve) {
  return buildHigh + cloudWan + maintHigh + reserve
}

// 支援 Node.js（測試）與瀏覽器（全域）兩種環境
if (typeof module !== 'undefined') {
  module.exports = { calcScore, calcTier, calcCosts, calcAdjustedReserve, calcAdjustedTotalLow, calcAdjustedTotalHigh }
}
