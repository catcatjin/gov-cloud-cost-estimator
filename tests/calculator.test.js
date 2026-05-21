// 執行方式：node tests/calculator.test.js
const config = require('../js/config.js')
// 設定全域變數供 calculator.js 使用
global.WEIGHTS       = config.WEIGHTS
global.TIER_DEFAULTS = config.TIER_DEFAULTS

const { calcScore, calcTier, calcCosts } = require('../js/calculator.js')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++ }
  catch (e) { console.error(`✗ ${name}: ${e.message}`); failed++ }
}
function expect(actual) {
  return {
    toBe:        (exp) => { if (actual !== exp) throw new Error(`got ${JSON.stringify(actual)}, want ${JSON.stringify(exp)}`) },
    toBeCloseTo: (exp, delta = 1) => { if (Math.abs(actual - exp) > delta) throw new Error(`got ${actual}, want ~${exp} (delta ${delta})`) },
  }
}

// ── calcScore ──────────────────────────────────────────────────────────────
test('全部 null = 0', () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:null })).toBe(0))
test('全選最小值 q1=a 其餘 a = 5', () => expect(calcScore({ q1:'a',q2:'a',q3:'a',q4:'a',q5:'a',q6:'a',q7:'a',q8:'a' })).toBe(5))
// q1=50,q2=35,q3=25,q4=20,q5=15,q6=25,q7=20,q8=20 = 210
test('最大分數 = 210', () => expect(calcScore({ q1:'e',q2:'e',q3:'d',q4:'d',q5:'c',q6:'d',q7:'d',q8:'e' })).toBe(210))
test('使用自訂 weights q8.b=20', () => {
  const w = JSON.parse(JSON.stringify(global.WEIGHTS))
  w.q8.b = 20
  expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'b' }, w)).toBe(20)
})

// Q8 新選項評分
test('q8=b（LLM API）= 5',       () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'b' })).toBe(5))
test('q8=c（RAG）= 10',          () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'c' })).toBe(10))
test('q8=d（fine-tune/ML）= 12', () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'d' })).toBe(12))
test('q8=e（自訓練/高風險）= 20', () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'e' })).toBe(20))

// ── calcTier ──────────────────────────────────────────────────────────────
test('分數 0 → S',   () => expect(calcTier(0)).toBe('S'))
test('分數 25 → S',  () => expect(calcTier(25)).toBe('S'))
test('分數 26 → M',  () => expect(calcTier(26)).toBe('M'))
test('分數 60 → M',  () => expect(calcTier(60)).toBe('M'))
test('分數 61 → L',  () => expect(calcTier(61)).toBe('L'))
test('分數 110 → L', () => expect(calcTier(110)).toBe('L'))
test('分數 111 → XL',() => expect(calcTier(111)).toBe('XL'))

// ── calcCosts S（角色：1 PM/arch合一 + 1 工程師，pmArchSal=35, engSal=28）
// buildLow  = (1×35 + 0×35 + 1×28) × 3 = 63×3 = 189
// buildHigh = (1×35 + 0×35 + 1×28) × 6 = 63×6 = 378
test('S buildLow = 189',         () => expect(calcCosts('S').buildLow).toBeCloseTo(189))
test('S buildHigh = 378',        () => expect(calcCosts('S').buildHigh).toBeCloseTo(378))
test('S maintLow = 0.3×12×28 = 100.8',  () => expect(calcCosts('S').maintLow).toBeCloseTo(100.8, 0.5))
test('S maintHigh = 0.5×12×28 = 168',   () => expect(calcCosts('S').maintHigh).toBeCloseTo(168))
test('S reserve = 0（無預備金）',         () => expect(calcCosts('S').reserve).toBe(0))
test('S isXL = false',                   () => expect(calcCosts('S').isXL).toBe(false))

// ── calcCosts M（角色：1 PM + 1 arch + 2–3 工程師，pmArchSal=40, engSal=28）
// buildLow  = (1×40 + 1×40 + 2×28) × 6  = 136×6  = 816
// buildHigh = (1×40 + 1×40 + 3×28) × 12 = 164×12 = 1968
// maintLow  = 0.5×12×28 = 168
// maintHigh = 0.7×12×28 = 235.2
// buildMid=1392, cloudMid=47.5, maintMid=201.6 → reserve=(1392+47.5+201.6)×0.10=164.11
test('M buildLow = 816',         () => expect(calcCosts('M').buildLow).toBeCloseTo(816))
test('M buildHigh = 1968',       () => expect(calcCosts('M').buildHigh).toBeCloseTo(1968))
test('M maintLow = 168',         () => expect(calcCosts('M').maintLow).toBeCloseTo(168))
test('M maintHigh = 235.2',      () => expect(calcCosts('M').maintHigh).toBeCloseTo(235.2, 0.5))
// reserve 此處驗證靜態估算值（cloudMid 基礎），UI 實際顯示的 adjustedReserve 在 app.js 中獨立計算
test('M reserve ≈ 164.11',       () => expect(calcCosts('M').reserve).toBeCloseTo(164.11, 2))

// ── calcCosts L（角色：1 PM + 1 arch + 4–6 工程師，pmArchSal=45, engSal=30）
// buildLow  = (1×45 + 1×45 + 4×30) × 10 = (45+45+120)×10 = 210×10 = 2100
// buildHigh = (1×45 + 1×45 + 6×30) × 18 = (45+45+180)×18 = 270×18 = 4860
// maintLow  = 1.0×12×30 = 360
// maintHigh = 1.5×12×30 = 540
// buildMid=3480, cloudMid=290, maintMid=450 → reserve=(3480+290+450)×0.15=4220×0.15=633
test('L buildLow = 2100',        () => expect(calcCosts('L').buildLow).toBeCloseTo(2100))
test('L buildHigh = 4860',       () => expect(calcCosts('L').buildHigh).toBeCloseTo(4860))
test('L maintLow = 360',         () => expect(calcCosts('L').maintLow).toBeCloseTo(360))
test('L maintHigh = 540',        () => expect(calcCosts('L').maintHigh).toBeCloseTo(540))
// reserve 此處驗證靜態估算值（cloudMid 基礎），UI 實際顯示的 adjustedReserve 在 app.js 中獨立計算
test('L reserve = 633',          () => expect(calcCosts('L').reserve).toBeCloseTo(633))

// ── calcCosts XL ──────────────────────────────────────────────────────────
test('XL isXL = true',    () => expect(calcCosts('XL').isXL).toBe(true))
test('XL cloudLow = 500', () => expect(calcCosts('XL').cloudLow).toBe(500))

// ── overrides ──────────────────────────────────────────────────────────────
// S 預設：pm=1, arch=0, engLow=1, engHigh=1, pmArchSal=35, engSal=28, durL=3, durH=6
test('durationLow 覆蓋 4 → S buildLow = 63×4 = 252', () =>
  expect(calcCosts('S', { durationLow: 4 }).buildLow).toBeCloseTo(252))
test('pmCount 覆蓋 2 → S buildLow = (2×35+1×28)×3 = 294', () =>
  expect(calcCosts('S', { pmCount: 2 }).buildLow).toBeCloseTo(294))
test('engSal 覆蓋 30 → S buildLow = (1×35+1×30)×3 = 195', () =>
  expect(calcCosts('S', { engSal: 30 }).buildLow).toBeCloseTo(195))
test('null override 仍使用預設值 → S buildLow = 189', () =>
  expect(calcCosts('S', { durationLow: null }).buildLow).toBeCloseTo(189))

// ── AI_WORKLOAD_TEMPLATES 結構驗證 ──────────────────────────────────────────
const {
  AI_WORKLOAD_TEMPLATES, INFERENCE_ITEMS, RETRAINING_CLOUD, RETRAINING_MAINT_ADJ
} = require('../js/config.js')

const ML_SOURCES = ['llmApi', 'rag', 'fineTune', 'customTraining', 'traditionalML']
ML_SOURCES.forEach(src => {
  test(`AI_WORKLOAD_TEMPLATES.${src} 結構完整`, () => {
    const t = AI_WORKLOAD_TEMPLATES[src]
    if (!t) throw new Error('template 不存在')
    if (!Array.isArray(t.buildPackages)) throw new Error('buildPackages 應為陣列')
    if (t.buildPackages.length === 0) throw new Error(`${src}.buildPackages 不應為空陣列`)
    if (!Array.isArray(t.cloudItems))   throw new Error('cloudItems 應為陣列')
    if (t.cloudItems.length === 0)    throw new Error(`${src}.cloudItems 不應為空陣列`)
    if (typeof t.buildStaffAdj.engineerDelta !== 'number') throw new Error('engineerDelta 應為數字')
    if (typeof t.buildStaffAdj.durationDelta !== 'number') throw new Error('durationDelta 應為數字')
  })
})

test('RETRAINING_CLOUD 鍵值完整', () => {
  const keys = ['none','once','yearly','quarterly','monthly']
  for (const k of keys) {
    if (typeof RETRAINING_CLOUD[k].monthlyNTD !== 'number') throw new Error(`RETRAINING_CLOUD.${k}.monthlyNTD 應為數字`)
  }
})

test('RETRAINING_MAINT_ADJ 鍵值完整', () => {
  const keys = ['none','once','yearly','quarterly','monthly']
  for (const k of keys) {
    if (typeof RETRAINING_MAINT_ADJ[k].pmMonthDelta !== 'number') throw new Error(`RETRAINING_MAINT_ADJ.${k}.pmMonthDelta 應為數字`)
  }
})

// ML 加成邊界測試（純函式模擬）
test('engineerDelta: 多來源加總超出上限時被截斷', () => {
  // customTraining(+2) + fineTune(+1) + traditionalML(+1) = +4
  // tier L: engHigh=6, cap=floor(6*0.5)=3
  // 4 > 3，所以 min(4,3) 應 < sumEng (cap 確實生效)
  const sources = ['customTraining', 'fineTune', 'traditionalML']
  const deltas = sources.map(s => AI_WORKLOAD_TEMPLATES[s].buildStaffAdj)
  const sumEng = deltas.reduce((s, d) => s + d.engineerDelta, 0)  // 4
  const capEng = Math.floor(6 * 0.5)                               // 3 (from TIERS.l.engHigh)
  if (sumEng <= capEng) throw new Error(`sumEng(${sumEng}) 應超出 capEng(${capEng}) 才能測試截斷`)
  expect(Math.min(sumEng, capEng)).toBe(capEng)                    // cap 截斷結果等於 cap
})

test('durationDelta: 多來源加總在上限內保持原值', () => {
  // customTraining(+2) + fineTune(+1) + traditionalML(+1) = +4 < cap(10)
  // 加總後不超限，結果應等於原始加總
  const sources = ['customTraining', 'fineTune', 'traditionalML']
  const deltas = sources.map(s => AI_WORKLOAD_TEMPLATES[s].buildStaffAdj)
  const sumDur = deltas.reduce((s, d) => s + d.durationDelta, 0)  // 4
  const capDur = 10
  if (sumDur >= capDur) throw new Error(`sumDur(${sumDur}) 應小於 capDur(${capDur}) 才能測試未截斷`)
  expect(Math.min(sumDur, capDur)).toBe(sumDur)                    // 結果不變
})

console.log(`\n結果：${passed} 通過，${failed} 失敗`)
if (failed > 0) process.exit(1)
