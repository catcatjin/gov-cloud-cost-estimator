#!/usr/bin/env node
// 伺服器端 Azure Retail Prices API 抓取腳本（無 CORS 限制）
// 用法：node scripts/fetch-prices.js

const fs   = require('fs')
const path = require('path')

const PRICES_PATH = path.join(__dirname, '..', 'prices.json')
const AZURE_API   = 'https://prices.azure.com/api/retail/prices'

const SKUS = [
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
  // API Management
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
  // 用量計費
  { name: 'Key Vault Operations',
    filter: "serviceName eq 'Key Vault' and contains(meterName,'Operations') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'Log Analytics Ingestion GB',
    filter: "serviceName eq 'Log Analytics' and contains(meterName,'Data Ingestion') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Insights Ingestion GB',
    filter: "serviceName eq 'Application Insights' and contains(meterName,'Data') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'Blob Storage Hot GRS GB',
    filter: "serviceName eq 'Storage' and skuName eq 'GRS' and contains(meterName,'Hot') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
]

async function fetchOne(sku) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const url = `${AZURE_API}?$filter=${encodeURIComponent(sku.filter)}&currencyCode=TWD`
    const res  = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      console.warn(`✗ ${sku.name} | HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    if (data.Items && data.Items.length > 0) {
      const item = data.Items[0]
      console.log(`✓ ${sku.name} | ${item.skuName} | ${item.retailPrice} TWD`)
      return { name: sku.name, price: item.retailPrice, meta: item.skuName }
    }
    console.warn(`✗ ${sku.name} | 無符合項目`)
    return null
  } catch (e) {
    console.warn(`✗ ${sku.name} | ${e.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  // 讀取現有 prices.json，失敗的 SKU 保留舊值
  let existing = { prices: {}, meta: {} }
  try {
    existing = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'))
  } catch (_) {
    console.log('prices.json 不存在，從空白開始')
  }

  console.log(`\n開始查詢 ${SKUS.length} 個 SKU...\n`)
  const settled = await Promise.allSettled(SKUS.map(fetchOne))

  const newPrices = {}
  const newMeta   = {}
  let successCount = 0
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      newPrices[r.value.name] = r.value.price
      newMeta[r.value.name]   = r.value.meta
      successCount++
    }
  }

  // 合併：舊值 + 新值（新值優先覆蓋成功查詢的 SKU）
  const mergedPrices = { ...existing.prices, ...newPrices }
  const mergedMeta   = { ...existing.meta,   ...newMeta   }

  const output = {
    lastUpdated: new Date().toISOString().slice(0, 10),
    source:      'github-actions',
    skuCount:    Object.keys(mergedPrices).length,
    prices:      mergedPrices,
    meta:        mergedMeta,
  }

  fs.writeFileSync(PRICES_PATH, JSON.stringify(output, null, 2) + '\n')
  if (successCount === 0) {
    console.warn('\n警告：所有 SKU 查詢失敗，prices.json 保留舊值未更新')
  } else {
    console.log(`\n完成：${successCount}/${SKUS.length} SKU 成功更新，prices.json 已寫入`)
  }
}

main()
