// Azure 費率從 GitHub Pages 同源 prices.json 載入
// 優先順序：prices.json（GitHub Pages）→ localStorage 快取
// file:// 環境或網路失敗時使用 localStorage 快取

const LS_KEY = 'govEstimatorPricingCache'

let _pricingData        = {}
let _pricingMeta        = {}
let _pricingSource      = 'unavailable'
let _pricingLastUpdated = null

// 工具啟動時呼叫：先載入 localStorage 快取，再嘗試抓取 prices.json
async function loadPricing() {
  _loadFromLocalStorage()
  await _fetchPricesJson()
}

// 從 localStorage 讀取上次成功的結果
function _loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const cached = JSON.parse(raw)
    if (!cached.prices || !cached.lastUpdated) return
    _pricingData        = cached.prices
    _pricingMeta        = cached.meta || {}
    _pricingSource      = 'localStorage'
    _pricingLastUpdated = cached.lastUpdated
  } catch (_e) {
    // 隱私模式或 localStorage 損毀，靜默略過
  }
}

// 將成功抓取的結果存入 localStorage
function _saveToLocalStorage(prices, meta, lastUpdated) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ prices, meta, lastUpdated }))
  } catch (_e) {
    // 容量不足或隱私模式，靜默略過
  }
}

// 從 GitHub Pages 同源抓取 prices.json（5 秒 timeout）
async function _fetchPricesJson() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch('./prices.json', { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.prices) throw new Error('invalid format')
    _pricingData        = data.prices
    _pricingMeta        = data.meta || {}
    _pricingSource      = 'github-pages'
    _pricingLastUpdated = data.lastUpdated
    _saveToLocalStorage(_pricingData, _pricingMeta, _pricingLastUpdated)
  } catch (_e) {
    // file:// 環境或網路錯誤：保留 localStorage 資料（若有）
    // _pricingSource 維持現有值（'localStorage' 或 'unavailable'）
  } finally {
    clearTimeout(timer)
  }
}

function getPricingStatus() {
  return {
    pricingData:        _pricingData,
    pricingMeta:        _pricingMeta,
    pricingSource:      _pricingSource,
    pricingLastUpdated: _pricingLastUpdated,
  }
}
