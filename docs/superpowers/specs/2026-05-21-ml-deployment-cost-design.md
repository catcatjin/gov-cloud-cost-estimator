# ML 應用部署費用估算 — 設計文件

**日期：** 2026-05-21
**狀態：** 已核准，待實作

---

## 背景與目標

目前工具的 AI 費用估算侷限於「呼叫現成 LLM API」（Azure OpenAI token 費用 + AI Search）。本次擴充目標是支援自訓練、fine-tune、常駐 endpoint、批次推論等 ML 部署情境，讓政府採購的估算範圍涵蓋完整 AI/ML 生命週期。

---

## 設計決策摘要

### 決策一：Q8 擴充，不新增主問卷計分題；新增條件式 AI/ML 設定器

Q8 從二元「有/無 AI」擴充為五選一，繼續參與規模評分（WEIGHTS.q8）。這樣保留現有 S/M/L/XL 心智模型，同時讓 AI 風險納入規模判斷。AI/ML 設定器是額外的費用計算輸入，不參與評分、不是問卷第九題。

**理由：** 若把 ML 類型做成全新問卷流程，會讓承辦人面對陌生工具；沿用 Q8 單選維持一致性。

### 決策二：規模評分與費用計算解耦

- **系統規模 (S/M/L/XL)**：由 Q1~Q8 加總決定，反映業務量、可用性、AI 風險
- **AI/ML 費用細節**：由獨立的「AI/ML 設定器」決定，不影響規模評分

**理由：** 50 人使用的 fine-tune 系統不應被升到 L，但其建置費和雲端費確實更高。兩者需要獨立計算。

### 決策三：AI_WORKLOAD_TEMPLATES 漸進取代 CLOUD_TEMPLATES.ai

新的 ML 費用項目由 `AI_WORKLOAD_TEMPLATES` 驅動；現有 `CLOUD_TEMPLATES.ai`（LLM/RAG）短期保留，中期橋接，長期統一。

### 決策四：訓練費用歸入建置費（人月加成），不單獨報價

首次訓練成本透過調整工程師人數與期程反映在建置費，而非另開一行「訓練費」。重訓雲端工時（GPU 算力）歸入雲端費；重訓人力歸入維運費。

**理由：** AI/ML 建置細項高度重疊，是同一批工程師同一段期程的工作，不宜逐項報價——會誤導採購者認為這些數字是精確報價。

---

## 問卷結構

### Q8（修改）：AI/ML 功能類型

```
○ 無 AI/ML 功能                              加分 +0
○ 一般 LLM API（摘要、改寫、客服回答）        加分 +5
○ RAG / 知識庫問答                            加分 +10
○ fine-tune 或傳統 ML / 預測模型              加分 +12
○ 自訓練模型或高風險 AI 決策輔助              加分 +20
```

`WEIGHTS.q8` 從 `{ a:0, b:10 }` 改為 `{ a:0, b:5, c:10, d:12, e:20 }`。

### Q8 與設定器的同步規則

Q8（單選）與設定器的模型來源（多選）可能不一致，例如 Q8 選「LLM API」（+5）但設定器又勾了 fine-tune，造成規模分數偏低。

**採用「自動取最高風險等級」策略：**

模型來源對應的 Q8 最低等級如下：

| 模型來源（設定器） | 對應 Q8 最低等級 |
|---|---|
| LLM API | b（+5）|
| RAG / 知識庫 | c（+10）|
| fine-tune / 傳統 ML | d（+12）|
| 自訓練模型 | e（+20）|

當使用者填完設定器後，系統自動比較「Q8 目前選項」與「設定器所選模型來源中的最高等級」，若設定器隱含的等級 > Q8 現值，則自動將 Q8 更新至對應等級，並在 UI 顯示提示說明（不強制，但預設採用）。

### AI/ML 設定器（新增，條件顯示）

**顯示條件：** Q8 ≠ 'a'（即任何有 AI/ML 的選項）

**不參與規模評分，只驅動費用計算。**

#### ① 模型來源（多選）

```
□ LLM API（呼叫現成 API，如 Azure OpenAI）
□ RAG / 知識庫（向量搜尋 + LLM 組合）
□ fine-tune（微調現有模型）
□ 自訓練模型（從頭訓練）
□ 傳統 ML / 預測模型（非 LLM，如分類、迴歸）
```

#### ② 推論方式（單選）

```
○ API 計量（按 token 或呼叫次數計費）
○ 常駐 endpoint（GPU VM 長跑，隨時可用）
○ 批次推論（排程觸發，執行完即停）
○ 混合（常駐 + 批次並用）
```

#### ③ 訓練頻率（單選，條件顯示）

**顯示條件：** 模型來源含 fine-tune / 自訓練 / 傳統 ML 任一選項

```
○ 無（一次訓練後不重訓）
○ 一次性（專案期間訓練一次）
○ 每年重訓
○ 每季重訓
○ 每月重訓
```

---

## 資料模型

### 新增：AI_WORKLOAD_TEMPLATES

```js
// config.js 新增，長期目標：取代 CLOUD_TEMPLATES.ai
const AI_WORKLOAD_TEMPLATES = {
  llmApi: {
    buildPackages: [
      'AI 使用情境設計',
      'Prompt 流程設計與調校',
      'LLM API 串接',
      '回答品質測試',
    ],
    cloudItems: [
      // token 費用，依 aiMonthlyQueries 計算
      { id: 'openai', label: 'Azure OpenAI（GPT-4o）', type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
    ],
    maintenanceItems: ['Prompt 維護與品質監控'],
    buildStaffAdj: { engineerDelta: 0, durationDelta: 0 },
  },

  rag: {
    buildPackages: [
      'RAG 架構設計',
      '知識庫資料清理與分塊',
      'Embedding 索引建置',
      'AI Search 設定',
      '檢索品質測試與調校',
    ],
    cloudItems: [
      { id: 'aiSearch', label: 'Azure AI Search', sku: 'AI Search Basic', monthlyNTD: 2100 },
      // embedding token 費用視 aiMonthlyQueries 計算
    ],
    maintenanceItems: ['知識庫定期更新', '索引重建排程'],
    buildStaffAdj: { engineerDelta: 1, durationDelta: 0 },
  },

  fineTune: {
    buildPackages: [
      '訓練資料清理與標註',
      'fine-tune 流程設計',
      '首次 fine-tune 執行',
      '模型評估與驗證',
      '模型部署流程設計',
    ],
    // 首次訓練工時不進年度雲端費，已含於建置費（人月加成）
    buildOneTimeNote: '首次 fine-tune GPU 工時（約 15,000 NTD，已納入建置費估算）',
    cloudItems: [
      { id: 'mlWorkspace', label: 'Azure ML Workspace', sku: 'ML Workspace', monthlyNTD: 800 },
    ],
    maintenanceItems: ['模型效能監控', '定期重訓（依頻率計費）'],
    buildStaffAdj: { engineerDelta: 1, durationDelta: 1 },
  },

  customTraining: {
    buildPackages: [
      '資料蒐集與標註管線',
      '模型架構設計',
      '訓練基礎設施建置',
      '首次完整訓練',
      '模型評估、A/B 測試',
      '模型治理與版本管控流程',
    ],
    // 首次訓練工時不進年度雲端費，已含於建置費（人月加成）
    buildOneTimeNote: '首次完整訓練 GPU 工時（約 60,000 NTD，已納入建置費估算）',
    cloudItems: [
      { id: 'mlWorkspace', label: 'Azure ML Workspace', sku: 'ML Workspace', monthlyNTD: 800 },
      { id: 'modelRegistry', label: '模型登錄 / 容器儲存', sku: 'Storage LRS', monthlyNTD: 500 },
    ],
    maintenanceItems: ['模型漂移監控', '定期重訓管線', 'MLOps 維護'],
    buildStaffAdj: { engineerDelta: 2, durationDelta: 2 },
  },

  traditionalML: {
    buildPackages: [
      '特徵工程與資料前處理',
      '模型訓練與超參數調整',
      '模型驗證與偏差檢測',
      '模型部署與 API 封裝',
    ],
    // 首次訓練工時不進年度雲端費，已含於建置費（人月加成）
    buildOneTimeNote: '首次訓練工時（約 8,000 NTD，已納入建置費估算）',
    cloudItems: [
      { id: 'mlWorkspace', label: 'Azure ML Workspace', sku: 'ML Workspace', monthlyNTD: 800 },
    ],
    maintenanceItems: ['模型效能監控', '定期重訓（依頻率）'],
    buildStaffAdj: { engineerDelta: 1, durationDelta: 1 },
  },
}
```

### 推論方式 → 雲端費項目

```js
const INFERENCE_ITEMS = {
  apiMetered: [],  // token 計費，已含在 llmApi / rag cloudItems

  onlineEndpoint: {
    id: 'mlEndpoint',
    label: 'Azure ML Managed Online Endpoint（GPU）',
    sku: 'NC4as T4 v3',      // 1× T4 GPU VM，最小常駐規格
    monthlyNTD: 12000,       // 佔位，實際由 prices.json 抓取
    adjustable: true, min: 1, max: 4,
  },

  batchInference: {
    id: 'mlBatch',
    label: 'Azure ML Batch Endpoint（Spot GPU）',
    type: 'usage-based',
    estimatedMonthlyNTD: 3000,  // 依批次頻率和資料量估算
  },
}
```

### 訓練頻率 → 雲端費 + 維運費（分開計算）

```js
// 重訓 GPU/CPU 工時 → 進雲端費
const RETRAINING_CLOUD = {
  none:     { monthlyNTD: 0,     label: '不重訓' },
  once:     { monthlyNTD: 0,     label: '一次性（已納入建置費）' },
  yearly:   { monthlyNTD: 1500,  label: '每年重訓 GPU 工時' },
  quarterly:{ monthlyNTD: 4000,  label: '每季重訓 GPU 工時' },
  monthly:  { monthlyNTD: 10000, label: '每月重訓 GPU 工時' },
}

// 重訓作業人力（資料整備、評估、上線）→ 進維運費
const RETRAINING_MAINT_ADJ = {
  none:     { pmMonthDelta: 0,    label: '' },
  once:     { pmMonthDelta: 0,    label: '' },
  yearly:   { pmMonthDelta: 0.1,  label: '每年重訓作業人力' },
  quarterly:{ pmMonthDelta: 0.25, label: '每季重訓作業人力' },
  monthly:  { pmMonthDelta: 0.5,  label: '每月重訓作業人力' },
}
```

---

## 費用計算架構

### cloudBreakdown()（修改）

```
總雲端費 =
  base（CLOUD_TEMPLATES[tier].base）
+ legacyAi（CLOUD_TEMPLATES[tier].ai，保留 LLM/RAG 舊資料）  ← 過渡期
+ workloadAi（AI_WORKLOAD_TEMPLATES[選項].cloudItems）         ← 新 ML 項目（不含首次訓練工時）
+ inferenceItems（INFERENCE_ITEMS[推論方式]）
+ retrainingCloud（RETRAINING_CLOUD[訓練頻率]，重訓 GPU 工時）
+ bundles（CLOUD_TEMPLATES[tier].bundles）
```

**過渡期防止雙重計費規則：**
- 若 AI/ML 設定器的模型來源含 `llmApi` 或 `rag`，則跳過 `CLOUD_TEMPLATES.ai` 對應項目，改用 `AI_WORKLOAD_TEMPLATES` 的版本
- 實作上在 `cloudBreakdown()` 以 item id 去重（以 `AI_WORKLOAD_TEMPLATES` 的 id 為優先）

### 建置費（修改）

沿用現有工具的低/高區間口徑，AI/ML 加成透過調整角色月成本和期程實現：

```
建置費低端 = 調整後角色月成本低端 × 調整後期程低端
建置費高端 = 調整後角色月成本高端 × 調整後期程高端

其中：
  調整後期程低端 = min(tier.durationLow  + Σ durationDelta, 18)   ← 上限 18 個月
  調整後期程高端 = min(tier.durationHigh + Σ durationDelta, 18)

  調整後角色月成本低端 = tier 各角色月費低端加總（含 AI/ML 工程師人數加成）
  調整後角色月成本高端 = tier 各角色月費高端加總（含 AI/ML 工程師人數加成）

  工程師人數加成 = min(Σ engineerDelta, tier.maxEngineers * 0.5)   ← 加成上限為 tier 最大工程師數的 50%

  （多選模型來源時，各選項的 delta 加總；加總後套用上限避免極端組合）
```

### 維運費（修改）

```
維運費低端 = (基礎人月低端 + aiMlMonitoringAdj + ragUpdateAdj + RETRAINING_MAINT_ADJ[頻率].pmMonthDelta) × 人月費低端
維運費高端 = (基礎人月高端 + aiMlMonitoringAdj + ragUpdateAdj + RETRAINING_MAINT_ADJ[頻率].pmMonthDelta) × 人月費高端

其中：
  aiMlMonitoringAdj = 0.2（有 AI/ML 時，監控調校人月加成）
  ragUpdateAdj      = 0.15（有 RAG 或重訓時，資料更新人月加成）
  RETRAINING_MAINT_ADJ[頻率].pmMonthDelta：依訓練頻率加成（見上方資料模型）
```

---

## UI 展示

### 建置費區塊

```
建置費
├─ 基礎建置工作（必含，不逐項報價）
│   需求訪談 ✓  架構設計 ✓  前後端開發 ✓  測試上線 ✓
│
├─ AI/ML 建置工作（有 AI 才顯示，不逐項報價）
│   [依模型來源顯示對應的 buildPackages]
│
└─ 人員編制說明
    工程師 N 人 × M 月（含 AI/ML 加成）
    已含工作範圍，非逐項報價
```

### 雲端費區塊

```
雲端年費
├─ 基礎平台（App Service / PostgreSQL / APIM）
├─ AI 功能
│   ├─ Azure OpenAI（GPT-4o）— 月 X 次查詢
│   ├─ Azure AI Search（RAG）
│   ├─ Azure ML Workspace
│   ├─ Managed Online Endpoint（GPU）
│   ├─ 批次推論工時（Spot）
│   └─ 重訓 GPU 工時（每季/月）
└─ 需求包（HA / CDN / WAF）
```

### 維運費區塊

```
維運費（年）
├─ 基礎維運
├─ AI/ML 監控調校
└─ 定期資料更新 / 知識庫維護
```

---

## 遷移策略

| 階段 | 行動 |
|------|------|
| **短期（本次）** | 新增 `AI_WORKLOAD_TEMPLATES`；`CLOUD_TEMPLATES.ai` 保持不動；ML 新項目由新結構進來 |
| **中期** | 將 `CLOUD_TEMPLATES.ai` 的 LLM / RAG 項目橋接進 `AI_WORKLOAD_TEMPLATES`，兩邊對齊 |
| **長期** | 移除 `CLOUD_TEMPLATES.ai`，`AI_WORKLOAD_TEMPLATES` 為唯一 AI 費用真相來源 |

---

## 測試策略

- Q8 舊版 `a/b` 測試需更新：`b` 現在代表 LLM API（+5），而非原本的「有 AI」（+10）
- 新增 Q8 c/d/e 的評分單元測試
- AI/ML 設定器不影響規模評分的邊界測試（設定器全選，Q8='a' → 規模不變）
- `cloudBreakdown()` 新舊 AI 費用不重複計算的測試
- 建置費人月加成計算測試（單選 / 多選組合）

---

## 範圍外（本次不做）

- 自訂 GPU SKU 選擇器（先用固定佔位值）
- Azure ML 詳細 compute cluster 設定
- 資料標註費用估算（外包標註工時）
- 高風險 AI 合規費用（PDPA / AI Act 評估）
