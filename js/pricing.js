// Azure Retail Pricing API 呼叫 + 離線費率備援
// 離線費率內嵌（確保 file:// 協議下可用）

const PRICING_SNAPSHOT = {
  lastUpdated: '2026-05-11',
  prices: {
    'App Service B1':           421,   // TWD/月（eastasia）
    'App Service S1':          2340,
    'App Service P1v3':        4140,
    'PostgreSQL B1ms':         1150,
    'PostgreSQL GP D2ds v4':   5760,
    'Blob Storage Hot LRS GB':  0.59,  // TWD/GB/月
  },
}

let _pricingData         = PRICING_SNAPSHOT.prices
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
  ]

  const results = {}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    for (const sku of skus) {
      const url = `${AZURE_API}?$filter=${encodeURIComponent(sku.filter)}&currencyCode=TWD`
      try {
        const res = await fetch(url, { signal: controller.signal })
        const data = await res.json()
        if (data.Items && data.Items.length > 0) {
          results[sku.name] = data.Items[0].retailPrice
        }
      } catch (e) {
        // 單一 SKU 失敗（含 AbortError）不中斷其他查詢
      }
    }
    if (Object.keys(results).length > 0) {
      _pricingData        = results
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
    pricingSource:      _pricingSource,
    pricingLastUpdated: _pricingLastUpdated,
  }
}
