// 所有計分權重與量級預設值的單一來源
// 瀏覽器：全域變數；Node.js：module.exports 匯出供測試使用

const WEIGHTS = {
  q1: { a: 5,  b: 10, c: 20, d: 35, e: 50 }, // 使用者規模
  q2: { a: 0,  b: 5,  c: 10, d: 20, e: 35 }, // 年度交易/處理量
  q3: { a: 0,  b: 5,  c: 15, d: 25 },         // 資料機敏等級
  q4: { a: 0,  b: 5,  c: 10, d: 20 },         // 外部系統介接
  q5: { a: 0,  b: 5,  c: 15 },                // 金流處理
  q6: { a: 0,  b: 5,  c: 10, d: 25 },         // 尖峰流量倍率
  q7: { a: 0,  b: 3,  c: 10, d: 20 },         // 可用性要求
  q8: { a: 0,  b: 10 },                       // AI 功能
}

// roles: 各量級角色組成預設值（pm/arch/engLow/engHigh/pmArchSal/engSal）
// cloudLow/cloudHigh 已含緩衝率，直接使用
const TIER_DEFAULTS = {
  S: {
    roles: { pm: 1, arch: 0, engLow: 1, engHigh: 1, pmArchSal: 35, engSal: 28 },
    durationLow: 3,     durationHigh: 6,
    maintMonthLow: 0.3, maintMonthHigh: 0.5,
    cloudLow: 3,        cloudHigh: 10,
    contingency: 0,
  },
  M: {
    roles: { pm: 1, arch: 1, engLow: 2, engHigh: 3, pmArchSal: 40, engSal: 28 },
    durationLow: 6,     durationHigh: 12,
    maintMonthLow: 0.5, maintMonthHigh: 0.7,
    cloudLow: 15,       cloudHigh: 80,
    contingency: 0.10,
  },
  L: {
    roles: { pm: 1, arch: 1, engLow: 4, engHigh: 6, pmArchSal: 45, engSal: 30 },
    durationLow: 10,    durationHigh: 18,
    maintMonthLow: 1.0, maintMonthHigh: 1.5,
    cloudLow: 80,       cloudHigh: 500,
    contingency: 0.15,
  },
  XL: {
    roles: null,
    durationLow: 12,    durationHigh: 24,
    maintMonthLow: null, maintMonthHigh: null,
    cloudLow: 500,      cloudHigh: 3000,
    contingency: 0.20,
  },
}

// Q7='有 AI 功能' 時，由 Q1/Q2 推算預設月查詢量（次/月）
const AI_QUERY_MAP_Q1 = { a: 1000, b: 50000, c: 200000, d: 2000000, e: 10000000 }
const AI_QUERY_MAP_Q2 = { a: 833,  b: 4167,  c: 41667,  d: 416667,  e: 833333  }

// 雲端服務分區架構：base（固定基礎）、ai（Q7='b' 才顯示）、bundles（可選加購）
const CLOUD_TEMPLATES = {
  S: {
    base: [
      { id: 'appSvc', label: 'App Service B1',           sku: 'App Service B1',  instances: 1 },
      { id: 'db',     label: 'PostgreSQL Flexible B1ms', sku: 'PostgreSQL B1ms', instances: 1 },
      { id: 'other',  label: 'Blob Storage + DNS/SSL',   monthlyNTD: 300,        instances: 1 },
    ],
    ai: [
      { id: 'openai', label: 'Azure OpenAI（GPT-4o）', type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        items: [
          { id: 'keyVault',  label: 'Key Vault（秘密/憑證管理）', monthlyNTD: 400,  instances: 1 },
          { id: 'vulnScan',  label: '弱點掃描（年度合規服務）',   monthlyNTD: 5000, instances: 1 },
        ],
      },
      {
        id: 'ha', label: '高可用',
        autoSelect: (answers) => answers.q7 !== 'a',
        items: [
          { id: 'haInstance', label: 'HA 額外實例', monthlyNTD: 900, instances: 1 },
        ],
      },
      {
        id: 'dr', label: '異地備援',
        autoSelect: (answers) => answers.q3 === 'c' || answers.q3 === 'd',
        items: [
          { id: 'grs', label: 'GRS 跨區備份', monthlyNTD: 170, instances: 1 },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (answers) => answers.q3 !== 'a',
        items: [
          { id: 'logAnalytics', label: 'Log Analytics（稽核日誌）', monthlyNTD: 300, instances: 1 },
        ],
      },
    ],
    buffer: 0.10,
  },
  M: {
    base: [
      { id: 'appSvc',  label: 'App Service S1',            sku: 'App Service S1',  instances: 2, adjustable: true, min: 1, max: 8 },
      { id: 'db',      label: 'PostgreSQL Flexible B2ms',  monthlyNTD: 1800,       instances: 1 },
      { id: 'storage', label: 'Blob Storage（50–500 GB）', monthlyNTD: 800,        instances: 1 },
      { id: 'network', label: 'API Management + DNS',      monthlyNTD: 1200,       instances: 1 },
    ],
    ai: [
      { id: 'openai',   label: 'Azure OpenAI（GPT-4o）',   type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
      { id: 'aiSearch', label: 'Azure AI Search（基本）',  monthlyNTD: 2100, instances: 1 },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        items: [
          { id: 'keyVault',  label: 'Key Vault（秘密/憑證管理）',      monthlyNTD: 400,   instances: 1 },
          { id: 'waf',       label: 'WAF（網頁應用防火牆）',           monthlyNTD: 6000,  instances: 1 },
          { id: 'defender',  label: 'Defender for Cloud（威脅偵測）',  monthlyNTD: 300,   instances: 1 },
          { id: 'vulnScan',  label: '弱點掃描（年度合規服務）',        monthlyNTD: 10000, instances: 1 },
        ],
      },
      {
        id: 'ha', label: '高可用',
        autoSelect: (answers) => answers.q6 === 'c' || answers.q6 === 'd' || answers.q7 === 'c' || answers.q7 === 'd',
        items: [
          { id: 'haInstance', label: 'HA 額外實例', monthlyNTD: 1560, instances: 1, adjustable: true, min: 1, max: 4 },
        ],
      },
      {
        id: 'dr', label: '異地備援',
        autoSelect: (answers) => answers.q3 === 'c' || answers.q3 === 'd' || answers.q7 === 'd',
        items: [
          { id: 'grs', label: 'GRS 跨區備份', monthlyNTD: 500, instances: 1 },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (_answers, tier) => tier !== 'S',
        items: [
          { id: 'logAnalytics', label: 'Log Analytics（稽核日誌）', monthlyNTD: 600, instances: 1 },
        ],
      },
    ],
    buffer: 0.15,
  },
  L: {
    base: [
      { id: 'appSvc',  label: 'App Service P1v3',        sku: 'App Service P1v3',      instances: 4, adjustable: true, min: 2, max: 12 },
      { id: 'db',      label: 'PostgreSQL GP D2ds v4',   sku: 'PostgreSQL GP D2ds v4', instances: 1 },
      { id: 'storage', label: 'Blob Storage 分層',        monthlyNTD: 2500,             instances: 1 },
      { id: 'network', label: 'CDN + API Mgmt Standard', monthlyNTD: 12500,            instances: 1 },
    ],
    ai: [
      { id: 'openai',   label: 'Azure OpenAI（GPT-4o）',       type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
      { id: 'aiSearch', label: 'Azure AI Search（標準 S1）',   monthlyNTD: 6300, instances: 1 },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        items: [
          { id: 'keyVault',  label: 'Key Vault（秘密/憑證管理）',          monthlyNTD: 400,   instances: 1 },
          { id: 'waf',       label: 'WAF v2（網頁應用防火牆）',          monthlyNTD: 12000, instances: 1 },
          { id: 'defender',  label: 'Defender for Cloud（威脅偵測）',    monthlyNTD: 3700,  instances: 1 },
          { id: 'ddos',      label: 'DDoS Protection',                   monthlyNTD: 3000,  instances: 1 },
          { id: 'vulnScan',  label: '弱點掃描 + 滲透測試（年度合規）',   monthlyNTD: 20000, instances: 1 },
        ],
      },
      {
        id: 'ha', label: '高可用',
        autoSelect: (answers) => answers.q6 === 'c' || answers.q6 === 'd' || answers.q7 === 'c' || answers.q7 === 'd',
        items: [
          { id: 'haZone', label: 'HA 跨可用區', monthlyNTD: 12500, instances: 1 },
        ],
      },
      {
        id: 'dr', label: '異地備援',
        autoSelect: (answers) => answers.q3 === 'c' || answers.q3 === 'd' || answers.q7 === 'd',
        items: [
          { id: 'drSync', label: 'DR 即時同步',   monthlyNTD: 4200, instances: 1 },
          { id: 'grs',    label: 'GRS Blob 備份', monthlyNTD: 2000, instances: 1 },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (_answers, tier) => tier !== 'S',
        items: [
          { id: 'apm',          label: 'Application Insights APM',     monthlyNTD: 3200, instances: 1 },
          { id: 'logAnalytics', label: 'Log Analytics（長期 90 天+）', monthlyNTD: 3000, instances: 1 },
        ],
      },
    ],
    buffer: 0.20,
  },
}

// Node.js 測試用匯出
if (typeof module !== 'undefined') {
  module.exports = { WEIGHTS, TIER_DEFAULTS, CLOUD_TEMPLATES, AI_QUERY_MAP_Q1, AI_QUERY_MAP_Q2 }
}

