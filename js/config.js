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
  q8: { a: 0, b: 5, c: 10, d: 12, e: 20 },   // AI/ML 功能類型
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
//
// 計費欄位說明：
//   sku          → 月費型：直接對應 pricingData 鍵（TWD/月），API 可查時自動覆蓋
//   unitSku      → 用量型：對應 pricingData 鍵（TWD/usageUnit），乘以 estimatedUsage 得月費
//   estimatedUsage / usageUnit → 估算用量，UI 顯示計算公式
//   monthlyNTD   → 以上均無時的備援月費（估算值）
const CLOUD_TEMPLATES = {
  S: {
    base: [
      { id: 'appSvc', label: 'App Service', type: 'selectable', defaultOption: 's1', adjustable: true, min: 1, max: 4, instances: 1,
        options: [
          { id: 's1', sku: 'App Service S1',  monthlyNTD: 2340 },  // 快照 2026-05-13
          { id: 's2', sku: 'App Service S2',  monthlyNTD: 4680 },
          { id: 's3', sku: 'App Service S3',  monthlyNTD: 9360 },
        ],
      },
      { id: 'db', label: 'PostgreSQL', type: 'selectable', defaultOption: 'gp_d2ds', adjustable: true, min: 1, max: 2, instances: 1,
        options: [
          { id: 'gp_d2ds', sku: 'PostgreSQL GP D2ds v4', monthlyNTD: 5760 },
          { id: 'gp_d4ds', sku: 'PostgreSQL GP D4ds v4', monthlyNTD: 9700 },
        ],
      },
      { id: 'other', label: 'Blob Storage + DNS/SSL', monthlyNTD: 300, instances: 1,
        note: '估算值：Blob Hot LRS ~100 GB（100 × 0.59 ≈ 59 TWD）+ Azure DNS + SSL 憑證費合計，依實際用量調整' },
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
          { id: 'keyVault', label: 'Key Vault（秘密/憑證管理）', instances: 1,
            unitSku: 'Key Vault Operations', estimatedUsage: 400, usageUnit: '萬次',
            monthlyNTD: 400 },
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
          { id: 'grs', label: 'GRS 跨區備份', instances: 1,
            unitSku: 'Blob Storage Hot GRS GB', estimatedUsage: 144, usageUnit: 'GB',
            monthlyNTD: 170 },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (answers) => answers.q3 !== 'a',
        items: [
          { id: 'logAnalytics', label: 'Log Analytics（稽核日誌）', instances: 1,
            unitSku: 'Log Analytics Ingestion GB', estimatedUsage: 4, usageUnit: 'GB',
            monthlyNTD: 300 },
        ],
      },
    ],
    buffer: 0.10,
  },
  M: {
    base: [
      { id: 'appSvc', label: 'App Service', type: 'selectable', defaultOption: 's1', adjustable: true, min: 1, max: 8, instances: 1,
        options: [
          { id: 's1',   sku: 'App Service S1',   monthlyNTD: 2340 },
          { id: 's2',   sku: 'App Service S2',   monthlyNTD: 4680 },
          { id: 'p1v3', sku: 'App Service P1v3', monthlyNTD: 4140 },
        ],
      },
      { id: 'db', label: 'PostgreSQL', type: 'selectable', defaultOption: 'gp_d2ds', adjustable: true, min: 1, max: 2, instances: 1,
        options: [
          { id: 'gp_d2ds', sku: 'PostgreSQL GP D2ds v4', monthlyNTD: 5760  },
          { id: 'gp_d4ds', sku: 'PostgreSQL GP D4ds v4', monthlyNTD: 9700  },
          { id: 'gp_d8ds', sku: 'PostgreSQL GP D8ds v4', monthlyNTD: 19400 },
        ],
      },
      { id: 'storage', label: 'Blob Storage（50–500 GB）', instances: 1,
        unitSku: 'Blob Storage Hot LRS GB', estimatedUsage: 200, usageUnit: 'GB',
        monthlyNTD: 800 },
      { id: 'apim', label: 'API Management', type: 'selectable', defaultOption: 'apim_basic', instances: 1,
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
      { id: 'aiSearch', label: 'Azure AI Search（基本）（RAG / 語意搜尋）',  sku: 'AI Search Basic', monthlyNTD: 2100, instances: 1, optional: true },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        notice: '弱點掃描為合規必要項目，屬非 Azure 市場服務，建議另行詢價。市場行情參考：8–15 萬/年',
        items: [
          { id: 'keyVault', label: 'Key Vault（秘密/憑證管理）', instances: 1,
            unitSku: 'Key Vault Operations', estimatedUsage: 400, usageUnit: '萬次',
            monthlyNTD: 400 },
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
          { id: 'grs', label: 'GRS 跨區備份', instances: 1,
            unitSku: 'Blob Storage Hot GRS GB', estimatedUsage: 424, usageUnit: 'GB',
            monthlyNTD: 500 },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (_answers, tier) => tier !== 'S',
        items: [
          { id: 'logAnalytics', label: 'Log Analytics（稽核日誌）', instances: 1,
            unitSku: 'Log Analytics Ingestion GB', estimatedUsage: 8, usageUnit: 'GB',
            monthlyNTD: 600 },
        ],
      },
    ],
    buffer: 0.15,
  },
  L: {
    base: [
      { id: 'appSvc', label: 'App Service', type: 'selectable', defaultOption: 'p1v3', adjustable: true, min: 2, max: 12, instances: 2,
        options: [
          { id: 'p1v3', sku: 'App Service P1v3', monthlyNTD: 4140  },
          { id: 'p2v3', sku: 'App Service P2v3', monthlyNTD: 8280  },
          { id: 'p3v3', sku: 'App Service P3v3', monthlyNTD: 16560 },
        ],
      },
      { id: 'db', label: 'PostgreSQL', type: 'selectable', defaultOption: 'gp_d4ds', adjustable: true, min: 1, max: 3, instances: 1,
        options: [
          { id: 'gp_d4ds', sku: 'PostgreSQL GP D4ds v4', monthlyNTD: 9700  },
          { id: 'gp_d8ds', sku: 'PostgreSQL GP D8ds v4', monthlyNTD: 19400 },
          { id: 'gp_e4ds', sku: 'PostgreSQL GP E4ds v4', monthlyNTD: 14000 },
        ],
      },
      { id: 'storage', label: 'Blob Storage 分層', instances: 1,
        unitSku: 'Blob Storage Hot LRS GB', estimatedUsage: 1000, usageUnit: 'GB',
        monthlyNTD: 2500 },
      { id: 'cdn', label: 'Azure CDN / Front Door', monthlyNTD: 4300, instances: 1,
        note: '估算值：Azure Front Door Standard 固定費 + 流量費概估（~$150 USD/月），依流量規模調整' },
      { id: 'apim', label: 'API Management', type: 'selectable', defaultOption: 'apim_standard', instances: 1,
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
      { id: 'aiSearch', label: 'Azure AI Search（標準 S1）（RAG / 語意搜尋）',   sku: 'AI Search Standard S1', monthlyNTD: 6300, instances: 1, optional: true },
    ],
    bundles: [
      {
        id: 'security', label: '資安合規',
        autoSelect: (answers) => answers.q3 !== 'a',
        notice: '弱點掃描 + 滲透測試為合規必要項目，屬非 Azure 市場服務，建議另行詢價。市場行情參考：20–40 萬/年',
        items: [
          { id: 'keyVault', label: 'Key Vault（秘密/憑證管理）', instances: 1,
            unitSku: 'Key Vault Operations', estimatedUsage: 400, usageUnit: '萬次',
            monthlyNTD: 400 },
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
          { id: 'grs',    label: 'GRS Blob 備份', instances: 1,
            unitSku: 'Blob Storage Hot GRS GB', estimatedUsage: 1695, usageUnit: 'GB',
            monthlyNTD: 2000 },
        ],
      },
      {
        id: 'observe', label: '可觀測性',
        autoSelect: (_answers, tier) => tier !== 'S',
        items: [
          { id: 'apm',          label: 'Application Insights APM', instances: 1,
            unitSku: 'App Insights Ingestion GB', estimatedUsage: 36, usageUnit: 'GB',
            monthlyNTD: 3200 },
          { id: 'logAnalytics', label: 'Log Analytics（長期 90 天+）', instances: 1,
            unitSku: 'Log Analytics Ingestion GB', estimatedUsage: 38, usageUnit: 'GB',
            monthlyNTD: 3000 },
        ],
      },
    ],
    buffer: 0.20,
  },
}

// AI/ML 工作負載費用範本（每個 workload 類型的建置包、雲端費、維運費）
// buildStaffAdj：人員/期程加成（Delta 值，由 mlAdjustedOverrides 套用上限）
// buildOneTimeNote：首次訓練工時說明（已含於建置費估算，不進年度雲端費）
const AI_WORKLOAD_TEMPLATES = {
  llmApi: {
    buildPackages: ['AI 使用情境設計', 'Prompt 流程設計與調校', 'LLM API 串接', '回答品質測試'],
    buildOneTimeNote: null,
    cloudItems: [
      { id: 'openai', label: 'Azure OpenAI（GPT-4o）', type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
    ],
    maintenanceItems: ['Prompt 維護與品質監控'],
    buildStaffAdj: { engineerDelta: 0, durationDelta: 0 },
  },
  rag: {
    buildPackages: ['RAG 架構設計', '知識庫資料清理與分塊', 'Embedding 索引建置', 'AI Search 設定', '檢索品質測試與調校'],
    buildOneTimeNote: null,
    cloudItems: [
      { id: 'aiSearch', label: 'Azure AI Search（基本）', sku: 'AI Search Basic', monthlyNTD: 2100 },
    ],
    maintenanceItems: ['知識庫定期更新', '索引重建排程'],
    buildStaffAdj: { engineerDelta: 1, durationDelta: 0 },
  },
  fineTune: {
    buildPackages: ['訓練資料清理與標註', 'fine-tune 流程設計', '首次 fine-tune 執行', '模型評估與驗證', '模型部署流程設計'],
    buildOneTimeNote: '首次 fine-tune GPU 工時（約 15,000 NTD，已納入建置費估算）',
    cloudItems: [
      { id: 'mlWorkspace', label: 'Azure ML Workspace', sku: 'ML Workspace', monthlyNTD: 800 },
    ],
    maintenanceItems: ['模型效能監控', '定期重訓（依頻率計費）'],
    buildStaffAdj: { engineerDelta: 1, durationDelta: 1 },
  },
  customTraining: {
    buildPackages: ['資料蒐集與標註管線', '模型架構設計', '訓練基礎設施建置', '首次完整訓練', '模型評估、A/B 測試', '模型治理與版本管控'],
    buildOneTimeNote: '首次完整訓練 GPU 工時（約 60,000 NTD，已納入建置費估算）',
    cloudItems: [
      { id: 'mlWorkspace',   label: 'Azure ML Workspace',    sku: 'ML Workspace', monthlyNTD: 800 },
      { id: 'modelRegistry', label: '模型登錄 / 容器儲存',   sku: 'Storage LRS',  monthlyNTD: 500 },
    ],
    maintenanceItems: ['模型漂移監控', '定期重訓管線', 'MLOps 維護'],
    buildStaffAdj: { engineerDelta: 2, durationDelta: 2 },
  },
  traditionalML: {
    buildPackages: ['特徵工程與資料前處理', '模型訓練與超參數調整', '模型驗證與偏差檢測', '模型部署與 API 封裝'],
    buildOneTimeNote: '首次訓練工時（約 8,000 NTD，已納入建置費估算）',
    cloudItems: [
      { id: 'mlWorkspace', label: 'Azure ML Workspace', sku: 'ML Workspace', monthlyNTD: 800 },
    ],
    maintenanceItems: ['模型效能監控', '定期重訓（依頻率）'],
    buildStaffAdj: { engineerDelta: 1, durationDelta: 1 },
  },
}

// 推論方式 → 雲端費項目（apiMetered 不需要額外費用，已含在 llmApi/rag cloudItems）
const INFERENCE_ITEMS = {
  apiMetered:     null,
  onlineEndpoint: {
    id: 'mlEndpoint', label: 'Azure ML Managed Online Endpoint（T4 GPU）',
    sku: 'NC4as T4 v3', monthlyNTD: 12000,  // 佔位，待 prices.json 補充
  },
  batchInference: {
    id: 'mlBatch', label: 'Azure ML Batch Endpoint（Spot GPU）',
    estimatedMonthlyNTD: 3000,
  },
  mixed: null,  // 混合：UI 同時顯示 onlineEndpoint + batchInference，計算上各取其值
}

// 重訓 GPU 工時 → 進年度雲端費
const RETRAINING_CLOUD = {
  none:      { monthlyNTD: 0,     label: '不重訓' },
  once:      { monthlyNTD: 0,     label: '一次性（已納入建置費）' },
  yearly:    { monthlyNTD: 1500,  label: '每年重訓 GPU 工時' },
  quarterly: { monthlyNTD: 4000,  label: '每季重訓 GPU 工時' },
  monthly:   { monthlyNTD: 10000, label: '每月重訓 GPU 工時' },
}

// 重訓作業人力 → 進年度維運費
const RETRAINING_MAINT_ADJ = {
  none:      { pmMonthDelta: 0,    label: '' },
  once:      { pmMonthDelta: 0,    label: '' },
  yearly:    { pmMonthDelta: 0.1,  label: '每年重訓作業人力' },
  quarterly: { pmMonthDelta: 0.25, label: '每季重訓作業人力' },
  monthly:   { pmMonthDelta: 0.5,  label: '每月重訓作業人力' },
}

// Node.js 測試用匯出
if (typeof module !== 'undefined') {
  module.exports = { WEIGHTS, TIER_DEFAULTS, CLOUD_TEMPLATES, AI_QUERY_MAP_Q1, AI_QUERY_MAP_Q2,
    AI_WORKLOAD_TEMPLATES, INFERENCE_ITEMS, RETRAINING_CLOUD, RETRAINING_MAINT_ADJ }
}
