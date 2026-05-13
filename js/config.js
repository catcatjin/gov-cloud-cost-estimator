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

// Q8='有 AI 功能' 時，由 Q1/Q2 推算預設月查詢量（次/月）
const AI_QUERY_MAP_Q1 = { a: 1000, b: 50000, c: 200000, d: 2000000, e: 10000000 }
const AI_QUERY_MAP_Q2 = { a: 833,  b: 4167,  c: 41667,  d: 416667,  e: 833333  }

// 雲端服務分區架構：base（固定基礎）、ai（Q8='b' 才顯示）、bundles（可選加購）
// monthlyNTD 說明：
//   有 sku 且 sku 在 pricing.js PRICING_SNAPSHOT.prices 中 → 以快照值為準，API 可查時自動覆蓋
//   有 sku 但 sku 不在 snapshot prices 中                  → 估算值，note 標示估算依據
//   無 sku                                                 → 估算值，note 標示估算依據
const CLOUD_TEMPLATES = {
  S: {
    base: [
      { id: 'appSvc', label: 'App Service', type: 'selectable', defaultOption: 's1', adjustable: true, min: 1, max: 4, instances: 1,
        options: [
          { id: 's1', sku: 'App Service S1',  monthlyNTD: 2340 },  // 快照 2026-05-13
          { id: 's2', sku: 'App Service S2',  monthlyNTD: 4680 },  // 快照 2026-05-13
          { id: 's3', sku: 'App Service S3',  monthlyNTD: 9360 },  // 快照 2026-05-13
        ],
      },
      { id: 'db', label: 'PostgreSQL', type: 'selectable', defaultOption: 'gp_d2ds', adjustable: true, min: 1, max: 2, instances: 1,
        options: [
          { id: 'gp_d2ds', sku: 'PostgreSQL GP D2ds v4', monthlyNTD: 5760 },  // 快照 2026-05-13
          { id: 'gp_d4ds', sku: 'PostgreSQL GP D4ds v4', monthlyNTD: 9700 },  // 快照 2026-05-13
        ],
      },
      { id: 'other', label: 'Blob Storage + DNS/SSL', monthlyNTD: 300, instances: 1,
        note: '估算值：Blob Hot LRS ~100 GB（100 × 0.59 ≈ 59 TWD）+ Azure DNS + SSL 憑證費合計，非 API 可查項目，依實際用量調整' },
    ],
    ai: [
      { id: 'openai', label: 'Azure OpenAI（GPT-4o）', type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        notice: '弱點掃描為合規必要項目，屬非 Azure 市場服務，建議另行詢價。市場行情參考：3–8 萬/年',
        items: [
          { id: 'keyVault', label: 'Key Vault（秘密/憑證管理）', monthlyNTD: 400, instances: 1,
            note: '估算值：標準層秘密操作量概估（~$14 USD/月），依實際呼叫次數調整' },
        ],
      },
      {
        id: 'ha', label: '高可用',
        autoSelect: (answers) => answers.q7 !== 'a',
        items: [
          { id: 'haAppSvc', label: 'App Service HA 實例',    type: 'dynamic-base', baseRef: 'appSvc', instances: 1,
            note: '以選定 App Service 規格單價計算' },
          { id: 'haDb',     label: 'PostgreSQL HA Standby', type: 'dynamic-base', baseRef: 'db',     instances: 1,
            note: '以選定 PostgreSQL 規格單價計算（Flexible Server HA 模式）' },
        ],
      },
      {
        id: 'dr', label: '異地備援',
        autoSelect: (answers) => answers.q3 === 'c' || answers.q3 === 'd',
        items: [
          { id: 'grs', label: 'GRS 跨區備份', monthlyNTD: 170, instances: 1,
            note: '估算值：小型系統 Blob GRS 約為 LRS 費率 2 倍（~100 GB 等級）' },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (answers) => answers.q3 !== 'a',
        items: [
          { id: 'logAnalytics', label: 'Log Analytics（稽核日誌）', monthlyNTD: 300, instances: 1,
            note: '估算值：每日約 1 GB 日誌攝取量（Pay-per-use，~$2.46 USD/GB），依保留天數與資料量調整' },
        ],
      },
    ],
    buffer: 0.10,
  },
  M: {
    base: [
      { id: 'appSvc', label: 'App Service', type: 'selectable', defaultOption: 's1', adjustable: true, min: 1, max: 8, instances: 1,
        options: [
          { id: 's1',   sku: 'App Service S1',   monthlyNTD: 2340 },  // 快照 2026-05-13
          { id: 's2',   sku: 'App Service S2',   monthlyNTD: 4680 },  // 快照 2026-05-13
          { id: 'p1v3', sku: 'App Service P1v3', monthlyNTD: 4140 },  // 快照 2026-05-13
        ],
      },
      { id: 'db', label: 'PostgreSQL', type: 'selectable', defaultOption: 'gp_d2ds', adjustable: true, min: 1, max: 2, instances: 1,
        options: [
          { id: 'gp_d2ds', sku: 'PostgreSQL GP D2ds v4', monthlyNTD: 5760  },  // 快照 2026-05-13
          { id: 'gp_d4ds', sku: 'PostgreSQL GP D4ds v4', monthlyNTD: 9700  },  // 快照 2026-05-13
          { id: 'gp_d8ds', sku: 'PostgreSQL GP D8ds v4', monthlyNTD: 19400 },  // 快照 2026-05-13
        ],
      },
      { id: 'storage', label: 'Blob Storage（50–500 GB）', monthlyNTD: 800, instances: 1,
        note: '估算值：儲存費 ~200 GB × 0.59 ≈ 118 TWD，加計讀寫交易費與資料提取費，依實際用量調整' },
      { id: 'apim', label: 'API Management', type: 'selectable', defaultOption: 'apim_basic', instances: 1,
        note: '估算值：依 Azure API Management 東亞公布定價，不含於 Azure Retail Prices API 自動更新',
        options: [
          { id: 'apim_basic',    sku: 'API Management Basic',    monthlyNTD: 3100 },
          { id: 'apim_standard', sku: 'API Management Standard', monthlyNTD: 7800 },
        ],
      },
      { id: 'dns', label: 'DNS', monthlyNTD: 200, instances: 1,
        note: '估算值：Azure DNS 公共區域固定費 + 月查詢量（~$6 USD/月）' },
    ],
    ai: [
      { id: 'openai',   label: 'Azure OpenAI（GPT-4o）',   type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
      { id: 'aiSearch', label: 'Azure AI Search（基本）',  sku: 'AI Search Basic', monthlyNTD: 2100, instances: 1 },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        notice: '弱點掃描為合規必要項目，屬非 Azure 市場服務，建議另行詢價。市場行情參考：8–15 萬/年',
        items: [
          { id: 'keyVault', label: 'Key Vault（秘密/憑證管理）',     monthlyNTD: 400,  instances: 1,
            note: '估算值：標準層秘密操作量概估（~$14 USD/月），依實際呼叫次數調整' },
          { id: 'waf',      label: 'WAF（網頁應用防火牆）',          monthlyNTD: 6000, instances: 1,
            note: '估算值：Azure App Gateway WAF v2 固定費，實際依容量單位（CU）與流量調整' },
          { id: 'defender', label: 'Defender for Cloud（威脅偵測）', monthlyNTD: 300,  instances: 1,
            note: '估算值：僅含 Defender for App Service（~$15 USD/月），啟用更多服務需另計' },
        ],
      },
      {
        id: 'ha', label: '高可用',
        autoSelect: (answers) => answers.q6 === 'c' || answers.q6 === 'd' || answers.q7 === 'c' || answers.q7 === 'd',
        items: [
          { id: 'haAppSvc', label: 'App Service HA 實例',    type: 'dynamic-base', baseRef: 'appSvc', instances: 1, adjustable: true, min: 1, max: 4,
            note: '以選定 App Service 規格單價計算' },
          { id: 'haDb',     label: 'PostgreSQL HA Standby', type: 'dynamic-base', baseRef: 'db',     instances: 1,
            note: '以選定 PostgreSQL 規格單價計算（Flexible Server HA 模式）' },
        ],
      },
      {
        id: 'dr', label: '異地備援',
        autoSelect: (answers) => answers.q3 === 'c' || answers.q3 === 'd' || answers.q7 === 'd',
        items: [
          { id: 'grs', label: 'GRS 跨區備份', monthlyNTD: 500, instances: 1,
            note: '估算值：中型系統 Blob GRS 約為 LRS 費率 2 倍（~500 GB 等級）' },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (_answers, tier) => tier !== 'S',
        items: [
          { id: 'logAnalytics', label: 'Log Analytics（稽核日誌）', monthlyNTD: 600, instances: 1,
            note: '估算值：每日約 2 GB 日誌攝取量（Pay-per-use，~$2.46 USD/GB），依保留天數與資料量調整' },
        ],
      },
    ],
    buffer: 0.15,
  },
  L: {
    base: [
      { id: 'appSvc', label: 'App Service', type: 'selectable', defaultOption: 'p1v3', adjustable: true, min: 2, max: 12, instances: 2,
        options: [
          { id: 'p1v3', sku: 'App Service P1v3', monthlyNTD: 4140  },  // 快照 2026-05-13
          { id: 'p2v3', sku: 'App Service P2v3', monthlyNTD: 8280  },  // 快照 2026-05-13
          { id: 'p3v3', sku: 'App Service P3v3', monthlyNTD: 16560 },  // 快照 2026-05-13
        ],
      },
      { id: 'db', label: 'PostgreSQL', type: 'selectable', defaultOption: 'gp_d4ds', adjustable: true, min: 1, max: 3, instances: 1,
        options: [
          { id: 'gp_d4ds', sku: 'PostgreSQL GP D4ds v4', monthlyNTD: 9700  },  // 快照 2026-05-13
          { id: 'gp_d8ds', sku: 'PostgreSQL GP D8ds v4', monthlyNTD: 19400 },  // 快照 2026-05-13
          { id: 'gp_e4ds', sku: 'PostgreSQL GP E4ds v4', monthlyNTD: 14000 },  // 快照 2026-05-13
        ],
      },
      { id: 'storage', label: 'Blob Storage 分層', monthlyNTD: 2500, instances: 1,
        note: '估算值：大型系統 Hot + Cool 多層儲存（1 TB+ 等級），依實際用量與層級比例調整' },
      { id: 'cdn',  label: 'Azure CDN / Front Door', monthlyNTD: 4300, instances: 1,
        note: '估算值：Azure Front Door Standard 固定費 + 流量費概估（~$150 USD/月），依流量規模調整' },
      { id: 'apim', label: 'API Management', type: 'selectable', defaultOption: 'apim_standard', instances: 1,
        note: '估算值：依 Azure API Management 東亞公布定價，不含於 Azure Retail Prices API 自動更新',
        options: [
          { id: 'apim_standard', sku: 'API Management Standard', monthlyNTD: 7800  },
          { id: 'apim_premium',  sku: 'API Management Premium',  monthlyNTD: 30000 },
        ],
      },
      { id: 'dns', label: 'DNS', monthlyNTD: 200, instances: 1,
        note: '估算值：Azure DNS 公共區域固定費 + 月查詢量（~$6 USD/月）' },
    ],
    ai: [
      { id: 'openai',   label: 'Azure OpenAI（GPT-4o）',       type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
      { id: 'aiSearch', label: 'Azure AI Search（標準 S1）',   sku: 'AI Search Standard S1', monthlyNTD: 6300, instances: 1 },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        notice: '弱點掃描 + 滲透測試為合規必要項目，屬非 Azure 市場服務，建議另行詢價。市場行情參考：20–40 萬/年',
        items: [
          { id: 'keyVault', label: 'Key Vault（秘密/憑證管理）',          monthlyNTD: 400,   instances: 1,
            note: '估算值：標準層秘密操作量概估（~$14 USD/月），依實際呼叫次數調整' },
          { id: 'waf',      label: 'WAF v2（網頁應用防火牆）',            monthlyNTD: 12000, instances: 1,
            note: '估算值：Azure App Gateway WAF v2 高用量，實際依容量單位（CU）與流量調整' },
          { id: 'defender', label: 'Defender for Cloud（威脅偵測）',      monthlyNTD: 3700,  instances: 1,
            note: '估算值：App Service + Storage + DB 多服務啟用概估，實際依啟用項目調整' },
          { id: 'ddos',     label: 'DDoS Protection',                     monthlyNTD: 6000,  instances: 1,
            note: '以 Azure DDoS IP Protection（$199 USD/IP/月）計算' },
        ],
      },
      {
        id: 'ha', label: '高可用',
        autoSelect: (answers) => answers.q6 === 'c' || answers.q6 === 'd' || answers.q7 === 'c' || answers.q7 === 'd',
        items: [
          { id: 'haAppSvc', label: 'App Service HA 跨可用區',  type: 'dynamic-base', baseRef: 'appSvc', instances: 1,
            note: '以選定 App Service 規格單價計算' },
          { id: 'haDb',     label: 'PostgreSQL HA Standby',   type: 'dynamic-base', baseRef: 'db',     instances: 1,
            note: '以選定 PostgreSQL 規格單價計算（Flexible Server HA 模式）' },
        ],
      },
      {
        id: 'dr', label: '異地備援',
        autoSelect: (answers) => answers.q3 === 'c' || answers.q3 === 'd' || answers.q7 === 'd',
        items: [
          { id: 'drSync', label: 'DR 即時同步',   monthlyNTD: 4200, instances: 1,
            note: '估算值：跨區 Active Geo-Replication + 同步流量費概估，依架構與資料量調整' },
          { id: 'grs',    label: 'GRS Blob 備份', monthlyNTD: 2000, instances: 1,
            note: '估算值：大型系統 Blob GRS 約為 LRS 費率 2 倍（1 TB+ 等級）' },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (_answers, tier) => tier !== 'S',
        items: [
          { id: 'apm',          label: 'Application Insights APM',     monthlyNTD: 3200, instances: 1,
            note: '估算值：每日約 5 GB 遙測資料 Pay-per-use（~$2.76 USD/GB），依實際遙測量調整' },
          { id: 'logAnalytics', label: 'Log Analytics（長期 90 天+）', monthlyNTD: 3000, instances: 1,
            note: '估算值：每日約 3–5 GB 日誌攝取 + 90 天保留，依保留天數與資料量調整' },
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
