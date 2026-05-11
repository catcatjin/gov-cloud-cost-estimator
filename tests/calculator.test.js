// 執行方式：node tests/calculator.test.js
const config = require('../js/config.js')
// 設定全域變數供 calculator.js 使用
global.WEIGHTS = config.WEIGHTS
global.TIER_DEFAULTS = config.TIER_DEFAULTS
global.DEFAULT_MONTHLY_COST = config.DEFAULT_MONTHLY_COST

const { calcScore, calcTier, calcCosts } = require('../js/calculator.js')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++ }
  catch (e) { console.error(`✗ ${name}: ${e.message}`); failed++ }
}
function expect(actual) {
  return {
    toBe: (exp) => { if (actual !== exp) throw new Error(`got ${actual}, want ${exp}`) },
    toBeCloseTo: (exp, delta = 1) => { if (Math.abs(actual - exp) > delta) throw new Error(`got ${actual}, want ~${exp}`) },
  }
}

// calcScore
test('全部 null = 0', () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null })).toBe(0))
test('全選最小值 q1=a 其餘 a = 5', () => expect(calcScore({ q1:'a',q2:'a',q3:'a',q4:'a',q5:'a',q6:'a',q7:'a' })).toBe(5))
test('最大分數 = 180', () => expect(calcScore({ q1:'e',q2:'e',q3:'d',q4:'d',q5:'c',q6:'d',q7:'b' })).toBe(180))
test('使用自訂 weights q7.b=20', () => {
  const w = JSON.parse(JSON.stringify(global.WEIGHTS))
  w.q7.b = 20
  expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:'b' }, w)).toBe(20)
})

// calcTier
test('分數 0 → S',   () => expect(calcTier(0)).toBe('S'))
test('分數 25 → S',  () => expect(calcTier(25)).toBe('S'))
test('分數 26 → M',  () => expect(calcTier(26)).toBe('M'))
test('分數 60 → M',  () => expect(calcTier(60)).toBe('M'))
test('分數 61 → L',  () => expect(calcTier(61)).toBe('L'))
test('分數 110 → L', () => expect(calcTier(110)).toBe('L'))
test('分數 111 → XL',() => expect(calcTier(111)).toBe('XL'))

// calcCosts S
test('S buildLow = 1.5×3×25 = 112.5', () => expect(calcCosts('S').buildLow).toBeCloseTo(112.5))
test('S buildHigh = 2×6×35 = 420',    () => expect(calcCosts('S').buildHigh).toBeCloseTo(420))
test('S reserve = 0（無預備金）',       () => expect(calcCosts('S').reserve).toBe(0))
test('S isXL = false',                 () => expect(calcCosts('S').isXL).toBe(false))

// calcCosts M
test('M buildLow = 3×6×25 = 450',     () => expect(calcCosts('M').buildLow).toBeCloseTo(450))
test('M buildHigh = 4×12×35 = 1680',  () => expect(calcCosts('M').buildHigh).toBeCloseTo(1680))
test('M maintLow = 0.5×12×25 = 150',  () => expect(calcCosts('M').maintLow).toBeCloseTo(150))
test('M maintHigh = 0.7×12×35 = 294', () => expect(calcCosts('M').maintHigh).toBeCloseTo(294))
test('M reserve ≈ 133（10%）',         () => expect(calcCosts('M').reserve).toBeCloseTo(133.45, 2))

// calcCosts XL
test('XL isXL = true',    () => expect(calcCosts('XL').isXL).toBe(true))
test('XL cloudLow = 500', () => expect(calcCosts('XL').cloudLow).toBe(500))

// overrides
test('overrides 覆蓋期程 → S buildLow = 1.5×4×25 = 150', () =>
  expect(calcCosts('S', { durationLow: 4 }).buildLow).toBeCloseTo(150))
test('null override 仍使用預設值', () =>
  expect(calcCosts('S', { durationLow: null }).buildLow).toBeCloseTo(112.5))

console.log(`\n結果：${passed} 通過，${failed} 失敗`)
if (failed > 0) process.exit(1)
