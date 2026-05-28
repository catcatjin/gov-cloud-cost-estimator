// 執行方式：node tests/trust-meta.test.js
const {
  CLOUD_TEMPLATES,
  AI_WORKLOAD_TEMPLATES,
  INFERENCE_ITEMS,
  RETRAINING_CLOUD,
  inferTrustMeta,
} = require('../js/config.js')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++ }
  catch (e) { console.error(`✗ ${name}: ${e.message}`); failed++ }
}
function expect(actual) {
  return {
    toBe: (exp) => { if (actual !== exp) throw new Error(`got ${JSON.stringify(actual)}, want ${JSON.stringify(exp)}`) },
    toBeTruthy: () => { if (!actual) throw new Error(`got ${JSON.stringify(actual)}, want truthy`) },
  }
}

test('sku 項目標示為官方費率', () => {
  const meta = inferTrustMeta({ id: 'appSvc', sku: 'App Service S1' }, { section: 'base' })
  expect(meta.sourceLabel).toBe('官方費率')
})

test('unitSku 項目標示為官方費率乘估算用量', () => {
  const meta = inferTrustMeta({ id: 'blob', unitSku: 'Blob Storage Hot LRS GB', estimatedUsage: 200 }, { section: 'base' })
  expect(meta.sourceLabel).toBe('官方費率 × 估算用量')
})

test('ai-token 項目標示為官方費率乘估算用量', () => {
  const meta = inferTrustMeta({ id: 'openai', type: 'ai-token', inputSku: 'OpenAI GPT-4o Input' }, { section: 'ml' })
  expect(meta.sourceLabel).toBe('官方費率 × 估算用量')
})

test('dynamic-base 項目標示為依基礎規格推算', () => {
  const meta = inferTrustMeta({ id: 'haAppSvc', type: 'dynamic-base', baseRef: 'appSvc' }, { section: 'bundle' })
  expect(meta.sourceLabel).toBe('依基礎規格推算')
})

test('base 項目預設為預設納入', () => {
  const meta = inferTrustMeta({ id: 'db', sku: 'PostgreSQL GP D2ds v4' }, { section: 'base' })
  expect(meta.necessityLabel).toBe('預設納入')
})

test('bundle 項目預設為條件納入', () => {
  const meta = inferTrustMeta(
    { id: 'waf', monthlyNTD: 6000 },
    { section: 'bundle', bundle: { autoSelect: () => true } },
  )
  expect(meta.necessityLabel).toBe('條件納入')
})

test('所有 CLOUD_TEMPLATES 項目都可推導可信度標籤', () => {
  for (const [tier, tpl] of Object.entries(CLOUD_TEMPLATES)) {
    for (const item of tpl.base) {
      const selectedOption = item.options?.find(o => o.id === item.defaultOption) || item.options?.[0]
      const meta = inferTrustMeta(item, { section: 'base', selectedOption })
      expect(meta.sourceLabel).toBeTruthy()
      expect(meta.necessityLabel).toBeTruthy()
    }
    for (const bundle of tpl.bundles) {
      for (const svc of bundle.items) {
        const selectedOption = svc.options?.find(o => o.id === svc.defaultOption) || svc.options?.[0]
        const meta = inferTrustMeta(svc, { section: 'bundle', bundle, selectedOption })
        expect(meta.sourceLabel).toBeTruthy()
        expect(meta.necessityLabel).toBeTruthy()
      }
    }
  }
})

test('所有 AI/ML 雲端費項目都可推導可信度標籤', () => {
  for (const tpl of Object.values(AI_WORKLOAD_TEMPLATES)) {
    for (const item of tpl.cloudItems) {
      const meta = inferTrustMeta(item, { section: 'ml' })
      expect(meta.sourceLabel).toBeTruthy()
      expect(meta.necessityLabel).toBeTruthy()
    }
  }
  for (const item of Object.values(INFERENCE_ITEMS).filter(Boolean)) {
    const meta = inferTrustMeta(item, { section: 'ml' })
    expect(meta.sourceLabel).toBeTruthy()
    expect(meta.necessityLabel).toBeTruthy()
  }
  for (const item of Object.values(RETRAINING_CLOUD).filter(i => i.monthlyNTD > 0)) {
    const meta = inferTrustMeta({ ...item, sourceType: 'manualAssumption' }, { section: 'ml' })
    expect(meta.sourceLabel).toBeTruthy()
    expect(meta.necessityLabel).toBeTruthy()
  }
})

console.log(`\n結果：${passed} 通過，${failed} 失敗`)
if (failed > 0) process.exit(1)
