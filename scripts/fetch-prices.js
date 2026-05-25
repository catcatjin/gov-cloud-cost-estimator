#!/usr/bin/env node
// 伺服器端 Azure Retail Prices API 抓取腳本（無 CORS 限制）
// 用法：node scripts/fetch-prices.js

const fs   = require('fs')
const path = require('path')

const PRICES_PATH = path.join(__dirname, '..', 'prices.json')
const AZURE_API   = 'https://prices.azure.com/api/retail/prices'

// hourly: true 表示 Azure API 回傳 TWD/小時，存入前需乘以 730 轉換為 TWD/月
const HOURS_PER_MONTH = 730

const SKUS = [
  // App Service（Consumption 計費單位為 1 Hour，需 ×730）
  // 用 contains(productName,'Linux') 確保取 Linux 價，API 不支援 operatingSystemFamily 欄位
  { name: 'App Service B1',   hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'B1' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Service S1',   hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'S1' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Service S2',   hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'S2' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Service S3',   hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'S3' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Service P1v3', hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'P1 v3' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Service P2v3', hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'P2 v3' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Service P3v3', hourly: true,
    filter: "serviceName eq 'Azure App Service' and skuName eq 'P3 v3' and contains(productName,'Linux') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },

  // PostgreSQL Flexible Server（按 vCore/小時計費，vcores 欄位指定核心數，需 ×vcores×730）
  // Ddsv4 系列：General Purpose，API 回傳 per-vCore 價格，乘以核心數得月費
  { name: 'PostgreSQL GP D2ds v4', hourly: true, vcores: 2, meta: 'D2ds v4（General Purpose）',
    filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(productName,'Ddsv4') and skuName eq '1 vCore' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'PostgreSQL GP D4ds v4', hourly: true, vcores: 4, meta: 'D4ds v4（General Purpose）',
    filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(productName,'Ddsv4') and skuName eq '1 vCore' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'PostgreSQL GP D8ds v4', hourly: true, vcores: 8, meta: 'D8ds v4（General Purpose）',
    filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(productName,'Ddsv4') and skuName eq '1 vCore' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  // Edsv4 系列：Memory Optimized
  { name: 'PostgreSQL GP E4ds v4', hourly: true, vcores: 4, meta: 'E4ds v4（Memory Optimized）',
    filter: "serviceName eq 'Azure Database for PostgreSQL' and contains(productName,'Edsv4') and skuName eq '1 vCore' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },

  // Blob Storage（TWD/GB/月，用量計費，productName 指定為 Blob Storage 避免匹配 ADLS/Files）
  { name: 'Blob Storage Hot LRS GB',
    filter: "serviceName eq 'Storage' and productName eq 'Blob Storage' and meterName eq 'Hot LRS Data Stored' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'Blob Storage Hot GRS GB',
    filter: "serviceName eq 'Storage' and productName eq 'Blob Storage' and meterName eq 'Hot GRS Data Stored' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },

  // Azure OpenAI：retail prices API 不提供此服務，價格由 prices.json 快照維護（0.16 TWD/1K tokens）

  // API Management v2（計費單位為 1 Hour，需 ×730；eastus 與 southeastasia 同價）
  { name: 'API Management Basic v2',    hourly: true,
    filter: "serviceName eq 'API Management' and skuName eq 'Basic v2' and meterName eq 'Basic v2 Unit' and armRegionName eq 'eastus' and priceType eq 'Consumption'" },
  { name: 'API Management Standard v2', hourly: true,
    filter: "serviceName eq 'API Management' and skuName eq 'Standard v2' and meterName eq 'Standard v2 Unit' and armRegionName eq 'eastus' and priceType eq 'Consumption'" },
  { name: 'API Management Premium v2',  hourly: true,
    filter: "serviceName eq 'API Management' and skuName eq 'Premium v2' and meterName eq 'Premium v2 Unit' and armRegionName eq 'eastus' and priceType eq 'Consumption'" },

  // Azure AI Search（按小時計費，需 ×730；serviceName 為 'Azure Cognitive Search'）
  { name: 'AI Search Basic', hourly: true,
    filter: "serviceName eq 'Azure Cognitive Search' and skuName eq 'Basic' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'AI Search Standard S1', hourly: true,
    filter: "serviceName eq 'Azure Cognitive Search' and skuName eq 'Standard S1' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },

  // ML Workspace：Retail API 無此固定計費項目，由 config.js monthlyNTD 提供 fallback
  // NC4as T4 v3：East Asia 無此 GPU SKU，由 config.js monthlyNTD 提供 fallback
  // Storage LRS（模型登錄 / 容器儲存用；productName 必須用 'Blob Storage' 而非 'Azure Blob Storage'）
  { name: 'Storage LRS',
    filter: "serviceName eq 'Storage' and productName eq 'Blob Storage' and meterName eq 'Hot LRS Data Stored' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },

  // 用量計費
  // meterName eq 'Operations' 對應 Secret/Key 一般操作（0.9453 TWD/10K）
  // 避免誤取 Advanced Key Operations（4.7266 TWD/10K）
  { name: 'Key Vault Operations',
    filter: "serviceName eq 'Key Vault' and meterName eq 'Operations' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  // Log Analytics: 使用 Analytics Logs SKU 的 Data Analyzed meter（付費層，72 TWD/GB）
  { name: 'Log Analytics Ingestion GB',
    filter: "serviceName eq 'Log Analytics' and skuName eq 'Analytics Logs' and meterName eq 'Analytics Logs Data Analyzed' and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
  { name: 'App Insights Ingestion GB',
    filter: "serviceName eq 'Application Insights' and contains(meterName,'Data') and armRegionName eq 'eastasia' and priceType eq 'Consumption'" },
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
      // retailPrice = 0 表示免費額度 meter，跳過以保留既有估算值
      if (item.retailPrice === 0) {
        console.warn(`✗ ${sku.name} | retailPrice=0（免費額度 meter），保留既有值`)
        return null
      }
      // hourly: true 的 SKU 需乘以 HOURS_PER_MONTH 轉換為月費；vcores 指定核心倍數
      const price = sku.hourly
        ? Math.round(item.retailPrice * (sku.vcores || 1) * HOURS_PER_MONTH)
        : item.retailPrice
      const vcoreNote = sku.vcores ? ` × ${sku.vcores} vCores` : ''
      console.log(`✓ ${sku.name} | ${item.skuName} | ${item.retailPrice} TWD${sku.hourly ? `${vcoreNote} × ${HOURS_PER_MONTH}h = ${price} TWD/月` : ''}`)
      return { name: sku.name, price, meta: sku.meta || item.skuName }
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

  if (successCount === 0) {
    console.warn('\n警告：所有 SKU 查詢失敗，prices.json 維持原樣未寫入')
    return
  }

  const output = {
    lastUpdated: new Date().toISOString().slice(0, 10),
    source:      'github-actions',
    skuCount:    Object.keys(mergedPrices).length,
    prices:      mergedPrices,
    meta:        mergedMeta,
  }

  fs.writeFileSync(PRICES_PATH, JSON.stringify(output, null, 2) + '\n')
  console.log(`\n完成：${successCount}/${SKUS.length} SKU 成功更新，prices.json 已寫入`)
}

main()
