// Azure Retail Pricing API 呼叫 + 離線費率備援
// 優先順序：Azure API 即時 → localStorage 上次成功快取 → 離線備援

const PRICING_SNAPSHOT = {
  lastUpdated: '2026-05-13',
  prices: {
    // ── App Service（eastasia，Windows，TWD/月）──
    'App Service B1':           421,
    'App Service S1':          2340,
    'App Service S2':          4680,
    'App Service S3':          9360,
    'App Service P1v3':        4140,
    'App Service P2v3':        8280,
    'App Service P3v3':       16560,
    // ── Azure Database for PostgreSQL（eastasia，TWD/月）──
    'PostgreSQL B1ms':         1150,
    'PostgreSQL GP D2ds v4':   5760,
    'PostgreSQL GP D4ds v4':   9700,
    'PostgreSQL GP D8ds v4':  19400,
    'PostgreSQL GP E4ds v4':  14000,
    // ── Storage（eastasia，TWD/GB/月）──
    'Blob Storage Hot LRS GB':  0.59,
    // ── Azure OpenAI（eastasia，TWD/1K input tokens）──
    'OpenAI GPT-4o Input':      0.16,
    // ── API Management（eastasia，TWD/月）──
    // 以下三筆為初始估算值，連線後由 Azure Retail Prices API 自動覆蓋
    'API Management Basic':    3100,
    'API Management Standard': 7800,
    'API Management Premium':  30000,
    // ── Azure AI Search（eastasia，TWD/月）──
    // 以下兩筆為初始估算值，連線後由 Azure Retail Prices API 自動覆蓋
    'AI Search Basic':         2100,
    'AI Search Standard S1':   6300,
    // ── 用量計費項目（unit price，TWD/單位）──
    // 以下初始值為估算，連線後由 Azure Retail Prices API 自動覆蓋
    'Key Vault Operations':         0.96,  // TWD / 萬次（10,000 ops）
    'Log Analytics Ingestion GB':  78.7,   // TWD / GB 攝取量
    'App Insights Ingestion GB':   88.3,   // TWD / GB 遙測資料
    'Blob Storage Hot GRS GB':      1.18,  // TWD / GB / 月（GRS ≈ LRS × 2）
  },
  // 規格顯示名稱（API 有回傳 skuName 時自動覆蓋）
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
    'API Management Standard': 'Standard（VNet + SLA 99.95%）',
    'API Management Premium':  'Premium（多區域部署 + 私有端點）',
    'AI Search Basic':         'Basic（AI 搜尋）',
    'AI Search Standard S1':   'Standard S1（AI 搜尋）',
  },
}

// localStorage 快取鍵
const LS_KEY = 'govEstimatorPricingCache'

let _pricingData         = { ...PRICING_SNAPSHOT.prices }
let _pricingMeta         = { ...PRICING_SNAPSHOT.meta }
let _pricingSource       = 'snapshot'
let _pricingLastUpdated  = PRICING_SNAPSHOT.lastUpdated
let _pricingApiCount     = 0   // 本次成功從 API 取得的 SKU 數量
let _pricingApiTotal     = 0   // 本次嘗試查詢的 SKU 總數

const AZURE_API = 'https://prices.azure.com/api/retail/prices'

// 工具啟動時呼叫：優先載入 localStorage 快取，再嘗試 API 更新
async function loadPricing() {
  _loadFromLocalStorage()
  await fetchAzurePrices()
}

// 從 localStorage 讀取上次成功的 API 結果
function _loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const cached = JSON.parse(raw)
    if (!cached.prices || !cached.lastUpdated) return
    _pricingData        = { ...PRICING_SNAPSHOT.prices, ...cached.prices }
    _pricingMeta        = { ...PRICING_SNAPSHOT.meta,   ...(cached.meta || {}) }
    _pricingSource      = 'localStorage'
    _pricingLastUpdated = cached.lastUpdated
    _pricingApiCount    = cached.apiCount || 0
    _pricingApiTotal    = cached.apiTotal || 0
  } catch (_e) {
    // localStorage 不可用（隱私模式等），靜默略過
  }
}

// 將成功抓取的結果存入 localStorage
function _saveToLocalStorage(prices, meta, lastUpdated, apiCount, apiTotal) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ prices, meta, lastUpdated, apiCount, apiTotal }))
  } catch (_e) {
    // 容量不足或隱私模式，靜默略過
  }
}

// 先讀舊快取，再 merge 新結果（新結果優先），避免本次部分失敗使快取退化
function _mergeAndSaveToLocalStorage(newPrices, newMeta, lastUpdated, newCount, total) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    let oldPrices = {}, oldMeta = {}
    if (raw) {
      const cached = JSON.parse(raw)
      oldPrices = cached.prices || {}
      oldMeta   = cached.meta   || {}
    }
    // 新結果優先覆寫；舊快取中本次未成功查詢的 SKU 保留不遺失
    const mergedPrices = { ...oldPrices, ...newPrices }
    const mergedMeta   = { ...oldMeta,   ...newMeta   }
    const mergedCount  = Object.keys(mergedPrices).length
    localStorage.setItem(LS_KEY, JSON.stringify({
      prices:    mergedPrices,
      meta:      mergedMeta,
      lastUpdated,
      apiCount:  mergedCount,
      apiTotal:  total,
    }))
  } catch (_e) {
    // 容量不足或隱私模式，靜默略過
  }
}

// 手動或自動呼叫 Azure API；失敗時靜默保留現有資料
async function fetchAzurePrices() {
  const skus = [
    // App Service
    { name: 'App Service B1',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'B1' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service S1',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'S1' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service S2',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'S2' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service S3',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'S3' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service P1v3',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'P1 v3' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service P2v3',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'P2 v3' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Service P3v3',
      filter: "serviceName eq 'Azure App Service' and skuName eq 'P3 v3' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    // PostgreSQL
    { name: 'PostgreSQL B1ms',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'B1MS') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'PostgreSQL GP D2ds v4',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'D2ds') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'PostgreSQL GP D4ds v4',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'D4ds') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'PostgreSQL GP D8ds v4',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'D8ds') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'PostgreSQL GP E4ds v4',
      filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(skuName,'E4ds') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    // Blob Storage
    { name: 'Blob Storage Hot LRS GB',
      filter: "serviceName eq 'Storage' and skuName eq 'LRS' and contains(meterName,'Hot') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    // Azure OpenAI
    { name: 'OpenAI GPT-4o Input',
      filter: "serviceName eq 'Azure OpenAI' and contains(skuName,'GPT-4o') and armRegionName eq 'eastasia' and priceType eq 'Consumption' and contains(meterName,'Input')" },
    // API Management（東亞月費，priceType Consumption 對應 Pay-as-you-go）
    { name: 'API Management Basic',
      filter: "serviceName eq 'API Management' and skuName eq 'Basic' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'API Management Standard',
      filter: "serviceName eq 'API Management' and skuName eq 'Standard' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'API Management Premium',
      filter: "serviceName eq 'API Management' and skuName eq 'Premium' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    // Azure AI Search
    { name: 'AI Search Basic',
      filter: "serviceName eq 'Search' and skuName eq 'Basic' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'AI Search Standard S1',
      filter: "serviceName eq 'Search' and skuName eq 'Standard S1' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    // 用量計費項目（unit price）
    { name: 'Key Vault Operations',
      filter: "serviceName eq 'Key Vault' and contains(meterName,'Operations') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'Log Analytics Ingestion GB',
      filter: "serviceName eq 'Log Analytics' and contains(meterName,'Data Ingestion') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'App Insights Ingestion GB',
      filter: "serviceName eq 'Application Insights' and contains(meterName,'Data') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
    { name: 'Blob Storage Hot GRS GB',
      filter: "serviceName eq 'Storage' and skuName eq 'GRS' and contains(meterName,'Hot') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  ]

  // 每筆 SKU 獨立查詢，各自有 10 秒 timeout，互不影響
  const fetchOne = async (sku) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const url = `${AZURE_API}?$filter=${encodeURIComponent(sku.filter)}&currencyCode=TWD`
      const res  = await fetch(url, { signal: controller.signal })
      const data = await res.json()
      if (data.Items && data.Items.length > 0) {
        return { name: sku.name, price: data.Items[0].retailPrice, meta: data.Items[0].skuName }
      }
      return null
    } catch (_e) {
      // 單一 SKU 失敗（含 AbortError）回傳 null，不中斷其他查詢
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  // 並行查詢所有 SKU，等全部完成（無論成功或失敗）
  const settled = await Promise.allSettled(skus.map(fetchOne))

  const results     = {}
  const metaResults = {}
  for (const r of settled) {
    // 只收 fulfilled 且有回傳值（非 null）的結果
    if (r.status === 'fulfilled' && r.value) {
      results[r.value.name]     = r.value.price
      metaResults[r.value.name] = r.value.meta
    }
  }

  _pricingApiTotal = skus.length
  _pricingApiCount = Object.keys(results).length

  if (_pricingApiCount > 0) {
    _pricingData        = { ..._pricingData, ...results }
    _pricingMeta        = { ..._pricingMeta, ...metaResults }
    _pricingSource      = _pricingApiCount === _pricingApiTotal ? 'api' : 'api-partial'
    _pricingLastUpdated = new Date().toISOString().slice(0, 10)
    _mergeAndSaveToLocalStorage(results, metaResults, _pricingLastUpdated, _pricingApiCount, _pricingApiTotal)
  }

  return getPricingStatus()
}

function getPricingStatus() {
  return {
    pricingData:        _pricingData,
    pricingMeta:        _pricingMeta,
    pricingSource:      _pricingSource,
    pricingLastUpdated: _pricingLastUpdated,
    pricingApiCount:    _pricingApiCount,
    pricingApiTotal:    _pricingApiTotal,
  }
}
