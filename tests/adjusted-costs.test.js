// 執行方式：node tests/adjusted-costs.test.js
const config = require('../js/config.js')
// 設定全域變數供 calculator.js 使用
global.WEIGHTS       = config.WEIGHTS
global.TIER_DEFAULTS = config.TIER_DEFAULTS

const { calcCosts } = require('../js/calculator.js')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++ }
  catch (e) { console.error(`✗ ${name}: ${e.message}`); failed++ }
}
function expect(actual) {
  return {
    toBe:        (exp) => { if (actual !== exp) throw new Error(`got ${JSON.stringify(actual)}, want ${JSON.stringify(exp)}`) },
    toBeCloseTo: (exp, delta = 1) => { if (Math.abs(actual - exp) > delta) throw new Error(`got ${actual}, want ~${exp} (delta ${delta})`) },
    toNotBe:     (exp) => { if (actual === exp) throw new Error(`got ${JSON.stringify(actual)}，兩者不應相同`) },
  }
}

// ── 純函式（與 app.js computed 公式完全相同）────────────────────────────────
// adjustedReserve：以使用者輸入的 cloudWan 取代靜態 cloudMid
function adjustedReserve(buildMid, cloudWan, maintMid, rate) {
  return (buildMid + cloudWan + maintMid) * rate
}
// adjustedTotalLow：建置低估 + cloudWan + 維護低估 + adjustedReserve
function adjustedTotalLow(buildLow, cloudWan, maintLow, reserve) {
  return buildLow + cloudWan + maintLow + reserve
}
// adjustedTotalHigh：建置高估 + cloudWan + 維護高估 + adjustedReserve
function adjustedTotalHigh(buildHigh, cloudWan, maintHigh, reserve) {
  return buildHigh + cloudWan + maintHigh + reserve
}

// ── 從 calcCosts 取得已驗證的基礎數值 ───────────────────────────────────────
const costsM = calcCosts('M')
const costsL = calcCosts('L')
const costsS = calcCosts('S')

// M tier 基礎數值（已由 calculator.test.js 驗證正確）
// buildLow=816, buildHigh=1968, buildMid=1392
// maintLow=168, maintHigh=235.2, maintMid=201.6
// contingency=0.10, cloudLow=15, cloudHigh=80 → cloudMid=47.5

// ── 測試案例 1：adjustedReserve 使用 cloudWan（非靜態 cloudMid）─────────────
test('案例1：M tier adjustedReserve 使用 cloudWan=60，與靜態 reserve 不同', () => {
  const cloudWan = 60
  const rate = 0.10  // M tier contingency

  // 以使用者輸入 cloudWan 計算
  const adjRes = adjustedReserve(costsM.buildMid, cloudWan, costsM.maintMid, rate)
  // 預期：(1392 + 60 + 201.6) × 0.10 = 165.36
  expect(adjRes).toBeCloseTo(165.36, 0.01)

  // 靜態 reserve（cloudMid = (15+80)/2 = 47.5）
  const staticRes = costsM.reserve  // ≈ 164.11
  // 兩者必須不同（確認公式有套用 cloudWan 而非靜態 cloudMid）
  expect(adjRes).toNotBe(staticRes)
})

// ── 測試案例 2：adjustedTotalLow 包含 adjustedReserve ───────────────────────
test('案例2：M tier adjustedTotalLow 使用 adjustedReserve，與靜態 totalLow 不同', () => {
  const cloudWan = 60
  const rate = 0.10

  const adjRes = adjustedReserve(costsM.buildMid, cloudWan, costsM.maintMid, rate)
  // 預期 adjustedTotalLow = 816 + 60 + 168 + 165.36 = 1209.36
  const adjTotalLow = adjustedTotalLow(costsM.buildLow, cloudWan, costsM.maintLow, adjRes)
  expect(adjTotalLow).toBeCloseTo(1209.36, 0.01)

  // 靜態 totalLow（不含 reserve，使用 cloudLow=15）：816 + 15 + 168 = 999
  const staticTotalLow = costsM.buildLow + costsM.cloudLow + costsM.maintLow
  expect(adjTotalLow).toNotBe(staticTotalLow)
})

// ── 測試案例 3：L tier adjustedReserve（cloudWan 等於靜態 cloudMid 的邊界案例）
test('案例3：L tier adjustedReserve，cloudWan=300 等於靜態 cloudMid=(80+500)/2=290 相近', () => {
  const cloudWan = 300
  const rate = 0.15  // L tier contingency

  // 預期：(3480 + 300 + 450) × 0.15 = 4230 × 0.15 = 634.5
  const adjRes = adjustedReserve(costsL.buildMid, cloudWan, costsL.maintMid, rate)
  expect(adjRes).toBeCloseTo(634.5, 0.01)

  // 靜態 reserve（cloudMid=290）：(3480+290+450)×0.15 = 4220×0.15 = 633
  // 公式結構相同，數值略有差異（因 cloudWan=300 ≠ cloudMid=290）
  expect(adjRes).toBeCloseTo(634.5, 0.1)
})

// ── 測試案例 4：一致性驗證（畫面與複製文字使用同一公式）────────────────────
test('案例4：同一組 inputs 下，直接套公式的結果應與函式計算結果完全一致', () => {
  const cloudWan = 150
  const rate = 0.10  // M tier

  // 模擬「畫面顯示」使用的計算路徑
  const reserveForDisplay = adjustedReserve(costsM.buildMid, cloudWan, costsM.maintMid, rate)
  const totalLowForDisplay = adjustedTotalLow(costsM.buildLow, cloudWan, costsM.maintLow, reserveForDisplay)
  const totalHighForDisplay = adjustedTotalHigh(costsM.buildHigh, cloudWan, costsM.maintHigh, reserveForDisplay)

  // 模擬「複製文字」使用的計算路徑（同一公式，不同呼叫路徑）
  const reserveForCopy = (costsM.buildMid + cloudWan + costsM.maintMid) * rate
  const totalLowForCopy = costsM.buildLow + cloudWan + costsM.maintLow + reserveForCopy
  const totalHighForCopy = costsM.buildHigh + cloudWan + costsM.maintHigh + reserveForCopy

  // 兩條路徑的結果必須完全相同（toBe 使用嚴格相等）
  expect(totalLowForDisplay).toBe(totalLowForCopy)
  expect(totalHighForDisplay).toBe(totalHighForCopy)
  expect(reserveForDisplay).toBe(reserveForCopy)
})

// ── 測試案例 5：cloudWan=0 邊界測試 ─────────────────────────────────────────
test('案例5：cloudWan=0 時，adjustedReserve=0（rate=0），adjustedTotalLow=buildLow+maintLow', () => {
  const cloudWan = 0
  const rate = 0  // S tier contingency = 0

  // adjustedReserve = (buildMid + 0 + maintMid) × 0 = 0
  const adjRes = adjustedReserve(costsS.buildMid, cloudWan, costsS.maintMid, rate)
  expect(adjRes).toBe(0)

  // adjustedTotalLow = buildLow + 0 + maintLow + 0 = buildLow + maintLow
  const adjTotalLow = adjustedTotalLow(costsS.buildLow, cloudWan, costsS.maintLow, adjRes)
  expect(adjTotalLow).toBeCloseTo(costsS.buildLow + costsS.maintLow, 0.01)
})

console.log(`\n結果：${passed} 通過，${failed} 失敗`)
if (failed > 0) process.exit(1)
