// Azure Retail Pricing API 呼叫 + 離線費率備援
// 離線費率內嵌（確保 file:// 協議下可用）

const PRICING_SNAPSHOT = {
  lastUpdated: '2026-05-12',
  prices: {
    'App Service B1':           421,   // TWD/月（eastasia）
    'App Service S1':          2340,
    'App Service P1v3':        4140,
    'PostgreSQL B1ms':         1150,
    'PostgreSQL GP D2ds v4':   5760,
    'Blob Storage Hot LRS GB':  0.59,  // TWD/GB/月
    'OpenAI GPT-4o Input':      0.16,  // TWD/1K input tokens（eastasia，2026-05-12 快照）
  },
  // 規格顯示名稱（API 有回傳 skuName 時自動覆蓋，否則使用此快照值）
  meta: {
    'App Service B1':          'B1（Basic）',
    'App Service S1':          'S1（Standard）',
    'App Service S2':          'S2（Standard）',
    'App Service S3':          'S3（Standard）',
    'App Service P1v3':        'P1 v3（Premium v3）',
    'App Service P2v3':        'P2 v3（Premium v3）',
    'App Service P3v3':        'P3 v3（Premium v3）',
    'PostgreSQL B1ms':         'B1ms（Burstable）',
    'PostgreSQL GP D2ds v4':   'D2ds v4（General Purpose）',
    'PostgreSQL GP D4ds v4':   'D4ds v4（General Purpose）',
    'PostgreSQL GP D8ds v4':   'D8ds v4（General Purpose）',
    'PostgreSQL GP E4ds v4':   'E4ds v4（Memory Optimized）',
    'OpenAI GPT-4o Input':     'GPT-4o（Input）',
    'API Management Basic':    'Basic（API 閘道）',
    'API Management Standard': 'Standard（API 閘道 + VNet + SLA 99.95%）',
  },
}

let _pricingData         = PRICING_SNAPSHOT.prices
let _pricingMeta         = PRICING_SNAPSHOT.meta
let _pricingSource       = 'snapshot'
let _pricingLastUpdated  = PRICING_SNAPSHOT.lastUpdated

const AZURE_API = 'https://prices.azure.com/api/retail/prices'

// 工具啟動時呼叫：snapshot 已內嵌，直接嘗試 API 更新
async function loadPricing() {
  await fetchAzurePrices()
}

// 手動或自動呼叫 Azure API；失敗時靜默保留 snapshot
async function fetchAzurePrices() {
  const skus = [
    { name: 'App Service B1',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'B1' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service S1',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'S1' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service P1v3',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'P1 v3' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'PostgreSQL B1ms',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'B1MS') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'PostgreSQL GP D2ds v4',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'D2ds') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'Blob Storage Hot LRS GB',
      filter: "serviceName eq 'Storage' and skuName eq 'LRS' and contains(meterName,'Hot') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'OpenAI GPT-4o Input',
      filter: "serviceName eq 'Azure OpenAI' and contains(skuName,'GPT-4o') and armRegionName eq 'eastasia' and priceType eq 'Consumption' and contains(meterName,'Input')" },
  ]

  const results     = {}
  const metaResults = {}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    for (const sku of skus) {
      const url = `${AZURE_API}?$filter=${encodeURIComponent(sku.filter)}&currencyCode=TWD`
      try {
        const res = await fetch(url, { signal: controller.signal })
        const data = await res.json()
        if (data.Items && data.Items.length > 0) {
          results[sku.name]     = data.Items[0].retailPrice
          metaResults[sku.name] = data.Items[0].skuName  // 使用 Azure 官方 skuName 覆蓋快照
        }
      } catch (e) {
        // 單一 SKU 失敗（含 AbortError）不中斷其他查詢
      }
    }
    if (Object.keys(results).length > 0) {
      _pricingData        = { ...PRICING_SNAPSHOT.prices, ...results }
      _pricingMeta        = { ...PRICING_SNAPSHOT.meta, ...metaResults }
      _pricingSource      = 'api'
      _pricingLastUpdated = new Date().toISOString().slice(0, 10)
    }
  } finally {
    clearTimeout(timeout)
  }
  return getPricingStatus()
}

function getPricingStatus() {
  return {
    pricingData:        _pricingData,
    pricingMeta:        _pricingMeta,
    pricingSource:      _pricingSource,
    pricingLastUpdated: _pricingLastUpdated,
  }
}
