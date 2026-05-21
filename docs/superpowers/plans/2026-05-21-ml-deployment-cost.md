# ML 部署費用估算 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將現有 AI/ML 費用估算從「有/無 LLM API」擴充為完整 ML 部署生命週期，支援自訓練、fine-tune、常駐 endpoint 及批次推論的費用計算。

**Architecture:** Q8 擴充為 5 選一（影響規模評分）；新增 AI/ML 設定器（3 個維度，只影響費用）；新增 `AI_WORKLOAD_TEMPLATES`、`INFERENCE_ITEMS`、`RETRAINING_CLOUD`、`RETRAINING_MAINT_ADJ` 資料模型；`cloudBreakdown()` 整合 ML 費用；`costs()` 透過 `mlAdjustedOverrides` 套用 ML 人員期程加成。

**Tech Stack:** Vue 3 Options API（CDN）、Vanilla JS、Node.js（測試）

---

## 異動檔案清單

| 動作 | 檔案 | 職責 |
|------|------|------|
| 修改 | `js/config.js` | WEIGHTS.q8 更新；新增 AI_WORKLOAD_TEMPLATES, INFERENCE_ITEMS, RETRAINING_CLOUD, RETRAINING_MAINT_ADJ |
| 修改 | `js/app.js` | Q8 QUESTIONS 展開；mlConfig 狀態；computed helpers；cloudBreakdown；costs；effectiveBuild；effectiveMaint；Q8 同步 watch |
| 修改 | `index.html` | AI/ML 設定器 UI；建置費工作包展示 |
| 修改 | `tests/calculator.test.js` | 更新 Q8 評分測試；新增 ML 相關測試 |

---

## Task 1：更新 WEIGHTS.q8 並擴充 Q8 選項

**Files:**
- Modify: `js/config.js:12`
- Modify: `js/app.js:80-85`（QUESTIONS[7]）
- Modify: `tests/calculator.test.js:22-29`

- [ ] **Step 1: 先跑現有測試，確認基準通過**

```bash
cd /Users/user/Downloads/codex/gov-cost-estimator-web
node tests/calculator.test.js
```
預期：全部 PASS（記錄目前通過數量）

- [ ] **Step 2: 更新 `js/config.js` 的 WEIGHTS.q8**

將：
```js
q8: { a: 0,  b: 10 },                       // AI 功能
```
改為：
```js
q8: { a: 0, b: 5, c: 10, d: 12, e: 20 },   // AI/ML 功能類型
```

- [ ] **Step 3: 執行測試，確認 Q8 相關測試失敗（預期）**

```bash
node tests/calculator.test.js
```
預期：`最大分數 = 200` 和 `使用自訂 weights q8.b=20` 測試失敗（其他應 PASS）

- [ ] **Step 4: 更新 `tests/calculator.test.js` 中的 Q8 測試**

找到並修改以下兩個測試：

```js
// 舊：test('最大分數 = 200', ...)  →  新：
test('最大分數 = 210', () => expect(calcScore({ q1:'e',q2:'e',q3:'d',q4:'d',q5:'c',q6:'d',q7:'d',q8:'e' })).toBe(210))

// 舊：test('全選最小值 q1=a 其餘 a = 5', ...)  不需改（q8='a' 仍是 +0，不影響）
// 但更新最大分數計算說明：q1=50,q2=35,q3=25,q4=20,q5=15,q6=25,q7=20,q8=20 = 210
```

新增以下 Q8 評分測試（加在 calcScore 測試區後面）：

```js
// Q8 新選項評分
test('q8=b（LLM API）= 5',       () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'b' })).toBe(5))
test('q8=c（RAG）= 10',          () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'c' })).toBe(10))
test('q8=d（fine-tune/ML）= 12', () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'d' })).toBe(12))
test('q8=e（自訓練/高風險）= 20', () => expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'e' })).toBe(20))

// Q8 舊版 b=10 的測試改為自訂 weights 測試
test('自訂 weights q8.b=20', () => {
  const w = JSON.parse(JSON.stringify(global.WEIGHTS))
  w.q8.b = 20
  expect(calcScore({ q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,q8:'b' }, w)).toBe(20)
})
```

- [ ] **Step 5: 跑測試，確認全部通過**

```bash
node tests/calculator.test.js
```
預期：全部 PASS

- [ ] **Step 6: 更新 `js/app.js` 中 QUESTIONS[7]（Q8 選項）**

找到：
```js
  {
    id: 'q8', title: '⑧ AI 功能',
    options: [
      { key: 'a', label: '無 AI 功能', shortLabel: '無' },
      { key: 'b', label: '有 AI 功能（如智慧客服、文件摘要）', shortLabel: '有' },
    ],
  },
```

改為：
```js
  {
    id: 'q8', title: '⑧ AI/ML 功能類型',
    options: [
      { key: 'a', label: '無 AI/ML 功能',                          shortLabel: '無' },
      { key: 'b', label: '一般 LLM API（摘要、改寫、客服回答）',    shortLabel: 'LLM API' },
      { key: 'c', label: 'RAG / 知識庫問答',                        shortLabel: 'RAG' },
      { key: 'd', label: 'fine-tune 或傳統 ML / 預測模型',          shortLabel: 'Fine-tune/ML' },
      { key: 'e', label: '自訓練模型或高風險 AI 決策輔助',          shortLabel: '自訓練/高風險' },
    ],
  },
```

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/app.js tests/calculator.test.js
git commit -m "feat: Q8 從二元擴充為 5 選一，評分更新（LLM API+5, RAG+10, fine-tune+12, 自訓練+20）"
```

---

## Task 2：新增 AI/ML 費用資料模型至 config.js

**Files:**
- Modify: `js/config.js`（在 `CLOUD_TEMPLATES` 後面新增）

- [ ] **Step 1: 在 `js/config.js` 末尾（`if (typeof module !== 'undefined')` 之前）新增 AI_WORKLOAD_TEMPLATES**

```js
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
    adjustable: true, min: 1, max: 4,
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
```

- [ ] **Step 2: 更新 config.js 末尾的 module.exports**

將：
```js
if (typeof module !== 'undefined') {
  module.exports = { WEIGHTS, TIER_DEFAULTS, CLOUD_TEMPLATES, AI_QUERY_MAP_Q1, AI_QUERY_MAP_Q2 }
}
```
改為：
```js
if (typeof module !== 'undefined') {
  module.exports = { WEIGHTS, TIER_DEFAULTS, CLOUD_TEMPLATES, AI_QUERY_MAP_Q1, AI_QUERY_MAP_Q2,
    AI_WORKLOAD_TEMPLATES, INFERENCE_ITEMS, RETRAINING_CLOUD, RETRAINING_MAINT_ADJ }
}
```

- [ ] **Step 3: 跑測試，確認無破壞**

```bash
node tests/calculator.test.js
```
預期：全部 PASS

- [ ] **Step 4: Commit**

```bash
git add js/config.js
git commit -m "feat: 新增 AI_WORKLOAD_TEMPLATES、INFERENCE_ITEMS、RETRAINING_CLOUD、RETRAINING_MAINT_ADJ 資料模型"
```

---

## Task 3：新增 mlConfig 狀態與 computed helpers 至 app.js

**Files:**
- Modify: `js/app.js`（data()、computed、watch）

- [ ] **Step 1: 在 data() 的 overrides 後面新增 mlConfig**

找到（約 app.js 第 112 行）：
```js
      showAdvanced: true,
      showWeights: false,
```

在前面新增：
```js
      // AI/ML 設定器狀態（不參與規模評分，只驅動費用計算）
      mlConfig: {
        sources:         [],    // 多選：'llmApi'|'rag'|'fineTune'|'customTraining'|'traditionalML'
        inferenceType:   null,  // 單選：'apiMetered'|'onlineEndpoint'|'batchInference'|'mixed'
        retrainingFreq:  null,  // 單選：'none'|'once'|'yearly'|'quarterly'|'monthly'
      },
```

- [ ] **Step 2: 在 computed 區塊（effectiveMaint 之後）新增 4 個 computed**

找到 `effectiveMaint()` 的結尾 `},`，在其後新增：

```js
    // 是否有 AI/ML 功能
    hasAiMl() {
      return this.answers.q8 !== null && this.answers.q8 !== 'a'
    },

    // 依設定器模型來源計算人員/期程加成 Delta
    mlStaffAdj() {
      const deltas = this.mlConfig.sources
        .map(src => (AI_WORKLOAD_TEMPLATES[src] || {}).buildStaffAdj || { engineerDelta: 0, durationDelta: 0 })
      const sumEng = deltas.reduce((s, d) => s + d.engineerDelta, 0)
      const sumDur = deltas.reduce((s, d) => s + d.durationDelta, 0)
      const r = this.tierDefaults.roles || {}
      return {
        engineerDelta: Math.min(sumEng, Math.floor((r.engHigh || 4) * 0.5)),
        durationDelta: Math.min(sumDur, 10),
      }
    },

    // 依重訓頻率計算維運人月加成 Delta
    mlMaintAdj() {
      if (!this.mlConfig.retrainingFreq) return 0
      return (RETRAINING_MAINT_ADJ[this.mlConfig.retrainingFreq] || {}).pmMonthDelta || 0
    },

    // 將 ML 加成套用在 overrides（使用者手動設定的欄位不覆蓋）
    mlAdjustedOverrides() {
      const o = { ...this.overrides }
      if (!this.hasAiMl || this.mlConfig.sources.length === 0) return o

      const t = this.tierDefaults
      const r = t.roles || {}
      const { engineerDelta, durationDelta } = this.mlStaffAdj
      const capEng = Math.ceil((r.engHigh || 4) * 1.5)

      if (engineerDelta > 0) {
        if (o.engCountLow  === null) o.engCountLow  = Math.min((r.engLow  || 1) + engineerDelta, capEng)
        if (o.engCountHigh === null) o.engCountHigh = Math.min((r.engHigh || 1) + engineerDelta, capEng)
      }
      if (durationDelta > 0) {
        if (o.durationLow  === null) o.durationLow  = Math.min((t.durationLow  || 6)  + durationDelta, 18)
        if (o.durationHigh === null) o.durationHigh = Math.min((t.durationHigh || 12) + durationDelta, 18)
      }

      const aiMaintAdj = 0.2
      const ragAdj = this.mlConfig.sources.includes('rag') ? 0.15 : 0
      const totalMaintAdj = aiMaintAdj + ragAdj + this.mlMaintAdj
      if (o.maintMonthLow  === null) o.maintMonthLow  = +((t.maintMonthLow  || 0) + totalMaintAdj).toFixed(2)
      if (o.maintMonthHigh === null) o.maintMonthHigh = +((t.maintMonthHigh || 0) + totalMaintAdj + 0.1).toFixed(2)

      return o
    },

    // 設定器模型來源對應的最低 Q8 等級（用於同步規則）
    mlSourceQ8Level() {
      const SOURCE_MIN = { llmApi: 'b', rag: 'c', fineTune: 'd', traditionalML: 'd', customTraining: 'e' }
      const ORDER = ['a', 'b', 'c', 'd', 'e']
      if (this.mlConfig.sources.length === 0) return null
      return this.mlConfig.sources
        .map(s => SOURCE_MIN[s] || 'b')
        .reduce((max, lvl) => ORDER.indexOf(lvl) > ORDER.indexOf(max) ? lvl : max, 'b')
    },
```

- [ ] **Step 3: 修改 costs() 使用 mlAdjustedOverrides**

找到：
```js
    costs() {
      if (!this.allAnswered) return null
      return calcCosts(this.tier, this.overrides)
    },
```
改為：
```js
    costs() {
      if (!this.allAnswered) return null
      return calcCosts(this.tier, this.mlAdjustedOverrides)
    },
```

- [ ] **Step 4: 修改 effectiveBuild() 和 effectiveMaint() 使用 mlAdjustedOverrides**

找到 `effectiveBuild()` 的 `const o = this.overrides`，改為 `const o = this.mlAdjustedOverrides`。
找到 `effectiveMaint()` 的 `const o = this.overrides`，改為 `const o = this.mlAdjustedOverrides`。

```js
    effectiveBuild() {
      const t = this.tierDefaults
      const o = this.mlAdjustedOverrides   // ← 原為 this.overrides
      const r = t.roles || {}
      return {
        pmCount:   o.pmCount   ?? r.pm    ?? 0,
        archCount: o.archCount ?? r.arch  ?? 0,
        engLow:    o.engCountLow  ?? r.engLow  ?? 1,
        engHigh:   o.engCountHigh ?? r.engHigh ?? 1,
        durLow:    o.durationLow  ?? t.durationLow,
        durHigh:   o.durationHigh ?? t.durationHigh,
        pmArchSal: o.pmArchSal ?? r.pmArchSal ?? 35,
        engSal:    o.engSal    ?? r.engSal    ?? 28,
      }
    },
    effectiveMaint() {
      const t = this.tierDefaults
      const o = this.mlAdjustedOverrides   // ← 原為 this.overrides
      const r = t.roles || {}
      return {
        pmLow:  o.maintMonthLow  ?? t.maintMonthLow,
        pmHigh: o.maintMonthHigh ?? t.maintMonthHigh,
        engSal: o.engSal ?? r.engSal ?? 28,
      }
    },
```

- [ ] **Step 5: 在 methods 後面、或 computed 後面新增 watch（在 `methods:` 前面加）**

找到 `methods: {`，在其正上方新增：

```js
  watch: {
    // 設定器模型來源改變時，自動將 Q8 升級至最高風險等級（不降級）
    'mlConfig.sources': {
      handler() {
        const level = this.mlSourceQ8Level
        if (!level) return
        const ORDER = ['a', 'b', 'c', 'd', 'e']
        if (ORDER.indexOf(this.answers.q8 || 'a') < ORDER.indexOf(level)) {
          this.answers.q8 = level
        }
      },
      deep: true,
    },
  },
```

- [ ] **Step 6: 跑測試，確認無破壞**

```bash
node tests/calculator.test.js
```
預期：全部 PASS

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: 新增 mlConfig 狀態、ML 費用 computed helpers、Q8 自動同步 watch"
```

---

## Task 4：更新 cloudBreakdown() 整合 ML 費用項目

**Files:**
- Modify: `js/app.js`（cloudBreakdown computed，約第 180 行起）

- [ ] **Step 1: 修改 hasAI 條件**

找到：
```js
      const hasAI = this.answers.q8 === 'b'
```
改為：
```js
      const hasAI = this.answers.q8 !== 'a' && this.answers.q8 !== null
```

- [ ] **Step 2: 在現有 aiItems 計算後，新增 ML 工作負載費用計算**

找到（約第 253 行）：
```js
      }) : []

      // 需求包
```

在 `}) : []` 後、`// 需求包` 前插入：

```js
      // ML 工作負載雲端費（從 AI_WORKLOAD_TEMPLATES，排除首次訓練工時）
      const workloadIds = new Set()
      const workloadAiItems = this.hasAiMl ? this.mlConfig.sources.flatMap(src => {
        const tpl = AI_WORKLOAD_TEMPLATES[src]
        if (!tpl) return []
        return (tpl.cloudItems || []).map(item => {
          workloadIds.add(item.id)
          let monthlyNTD = 0
          if (item.type === 'ai-token') {
            const q = this.effectiveAiMonthlyQueries
            const unitPrice = this.pricingData[item.sku] || 0.16
            monthlyNTD = q * item.tokensPerQuery / 1000 * unitPrice
          } else {
            monthlyNTD = item.sku
              ? (this.pricingData[item.sku] || item.monthlyNTD || 0)
              : (item.monthlyNTD || 0)
          }
          const yearWan = monthlyNTD * 12 / 10000
          return { ...item, yearWan: Math.round(yearWan * 10) / 10 }
        })
      }) : []

      // 推論費（API 計量已含於 llmApi/rag 的 cloudItems，不重複）
      const inferenceItems = []
      if (this.hasAiMl && this.mlConfig.inferenceType && this.mlConfig.inferenceType !== 'apiMetered') {
        const types = this.mlConfig.inferenceType === 'mixed'
          ? ['onlineEndpoint', 'batchInference']
          : [this.mlConfig.inferenceType]
        for (const t of types) {
          const item = INFERENCE_ITEMS[t]
          if (!item) continue
          const monthlyNTD = item.sku
            ? (this.pricingData[item.sku] || item.monthlyNTD || item.estimatedMonthlyNTD || 0)
            : (item.estimatedMonthlyNTD || 0)
          inferenceItems.push({ ...item, yearWan: Math.round(monthlyNTD * 12 / 10000 * 10) / 10 })
        }
      }

      // 重訓 GPU 工時
      const retrainingCloudItems = []
      if (this.hasAiMl && this.mlConfig.retrainingFreq) {
        const r = RETRAINING_CLOUD[this.mlConfig.retrainingFreq]
        if (r && r.monthlyNTD > 0) {
          retrainingCloudItems.push({
            id: 'retrainingCloud', label: r.label,
            yearWan: Math.round(r.monthlyNTD * 12 / 10000 * 10) / 10,
          })
        }
      }

      const mlItems = [...workloadAiItems, ...inferenceItems, ...retrainingCloudItems]
```

- [ ] **Step 3: 在現有 aiItems 過濾中加入去重邏輯**

找到：
```js
      const aiItems = hasAI ? tpl.ai.filter(item =>
        !item.optional || !this.optionalAiOff.includes(item.id)
      ).map(item => {
```
改為：
```js
      const aiItems = hasAI ? tpl.ai.filter(item =>
        (!item.optional || !this.optionalAiOff.includes(item.id)) &&
        !workloadIds.has(item.id)   // 排除已由 AI_WORKLOAD_TEMPLATES 提供的項目
      ).map(item => {
```

- [ ] **Step 4: 更新小計與回傳值，加入 mlItems**

找到：
```js
      const baseWan     = baseItems.reduce((s, i) => s + i.yearWan, 0)
      const aiWan       = aiItems.reduce((s, i) => s + i.yearWan, 0)
      const bundleWan   = bundles.reduce((s, b) => s + b.bundleYearWan, 0)
      const subtotalWan = baseWan + aiWan + bundleWan
```
改為：
```js
      const baseWan     = baseItems.reduce((s, i) => s + i.yearWan, 0)
      const aiWan       = aiItems.reduce((s, i) => s + i.yearWan, 0)
      const mlWan       = mlItems.reduce((s, i) => s + i.yearWan, 0)
      const bundleWan   = bundles.reduce((s, b) => s + b.bundleYearWan, 0)
      const subtotalWan = baseWan + aiWan + mlWan + bundleWan
```

找到 return 的 `aiItems,`，在其後加入：
```js
        mlItems,
```

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: cloudBreakdown 整合 ML 工作負載費用（endpoint/batch/重訓工時）並去重"
```

---

## Task 5：新增 AI/ML 設定器 UI 至 index.html

**Files:**
- Modify: `index.html`（在問卷區 `</div><!-- panel-left -->` 前）

- [ ] **Step 1: 找到問卷渲染迴圈的結束位置**

找到 index.html 的：
```html
        </div>
      </div>
      <!-- 右側：結果 -->
```

- [ ] **Step 2: 在問卷迴圈結束後、右側面板前，插入 AI/ML 設定器**

```html
        <!-- AI/ML 設定器（Q8 ≠ 'a' 才顯示） -->
        <div v-if="answers.q8 && answers.q8 !== 'a'" class="question-card ml-configurator">
          <div class="question-title">⚙ AI/ML 工作負載設定</div>
          <div class="ml-config-note">以下設定不影響規模評分，用於計算 AI/ML 費用明細。</div>

          <!-- ① 模型來源（多選） -->
          <div class="ml-section-label">① 模型來源（可多選）</div>
          <div class="options">
            <label v-for="src in mlSourceOptions" :key="src.key" class="option-label"
              :class="{ selected: mlConfig.sources.includes(src.key) }">
              <input type="checkbox" :value="src.key" v-model="mlConfig.sources">
              <span class="option-text">{{ src.label }}</span>
            </label>
          </div>

          <!-- ② 推論方式（單選） -->
          <div class="ml-section-label" style="margin-top:12px">② 推論方式</div>
          <div class="options">
            <label v-for="opt in mlInferenceOptions" :key="opt.key" class="option-label"
              :class="{ selected: mlConfig.inferenceType === opt.key }">
              <input type="radio" name="mlInferenceType" :value="opt.key" v-model="mlConfig.inferenceType">
              <span class="option-text">{{ opt.label }}</span>
            </label>
          </div>

          <!-- ③ 訓練頻率（只在選了需要訓練的來源時顯示） -->
          <template v-if="mlConfig.sources.some(s => ['fineTune','customTraining','traditionalML'].includes(s))">
            <div class="ml-section-label" style="margin-top:12px">③ 訓練頻率</div>
            <div class="options">
              <label v-for="opt in mlRetrainingOptions" :key="opt.key" class="option-label"
                :class="{ selected: mlConfig.retrainingFreq === opt.key }">
                <input type="radio" name="mlRetrainingFreq" :value="opt.key" v-model="mlConfig.retrainingFreq">
                <span class="option-text">{{ opt.label }}</span>
              </label>
            </div>
          </template>

          <!-- Q8 同步提示 -->
          <div v-if="mlSourceQ8Level && mlSourceQ8Level !== answers.q8"
            class="ml-sync-hint" style="margin-top:8px; font-size:0.85em; color:#888;">
            ⚡ 依模型來源，Q8 已自動更新為最高風險等級
          </div>
        </div>
```

- [ ] **Step 3: 在 app.js 的 computed 區塊新增三個靜態選項列表**

在 `mlSourceQ8Level()` 之後新增：

```js
    mlSourceOptions() {
      return [
        { key: 'llmApi',        label: 'LLM API（呼叫現成 API，如 Azure OpenAI）' },
        { key: 'rag',           label: 'RAG / 知識庫（向量搜尋 + LLM 組合）' },
        { key: 'fineTune',      label: 'fine-tune（微調現有模型）' },
        { key: 'customTraining',label: '自訓練模型（從頭訓練）' },
        { key: 'traditionalML', label: '傳統 ML / 預測模型（如分類、迴歸）' },
      ]
    },
    mlInferenceOptions() {
      return [
        { key: 'apiMetered',     label: 'API 計量（按 token 或呼叫次數計費）' },
        { key: 'onlineEndpoint', label: '常駐 endpoint（GPU VM 長跑）' },
        { key: 'batchInference', label: '批次推論（排程觸發，閒置零成本）' },
        { key: 'mixed',          label: '混合（常駐 + 批次並用）' },
      ]
    },
    mlRetrainingOptions() {
      return [
        { key: 'none',      label: '無（一次訓練後不重訓）' },
        { key: 'once',      label: '一次性（專案期間訓練一次）' },
        { key: 'yearly',    label: '每年重訓' },
        { key: 'quarterly', label: '每季重訓' },
        { key: 'monthly',   label: '每月重訓' },
      ]
    },
```

- [ ] **Step 4: Commit**

```bash
git add index.html js/app.js
git commit -m "feat: 新增 AI/ML 設定器 UI（模型來源多選、推論方式、訓練頻率）"
```

---

## Task 6：更新雲端費 UI 顯示 ML 費用區塊

**Files:**
- Modify: `index.html`（雲端費展示區塊，約第 112 行起）

- [ ] **Step 1: 找到 AI 功能顯示區塊**

找到：
```html
                <template v-if="cloudBreakdown.aiItems.length > 0 || cloudBreakdown.optionalAiAll.length > 0">
                  <div class="bundle-section-header">AI 功能</div>
```

- [ ] **Step 2: 在 AI 功能顯示後，新增 ML 工作負載費用展示**

在 `</template><!-- AI功能 -->` 結束後插入：

```html
                <!-- ML 工作負載費用 -->
                <template v-if="cloudBreakdown.mlItems && cloudBreakdown.mlItems.length > 0">
                  <div class="bundle-section-header">AI/ML 工作負載</div>
                  <template v-for="item in cloudBreakdown.mlItems" :key="item.id">
                    <div class="cost-line">
                      <span class="cost-line-label">{{ item.label }}</span>
                      <span class="cost-line-value">{{ item.yearWan.toFixed(1) }} 萬/年</span>
                    </div>
                  </template>
                </template>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: 雲端費 UI 新增 AI/ML 工作負載費用展示區塊"
```

---

## Task 7：更新建置費 UI 顯示 AI/ML 工作包說明

**Files:**
- Modify: `index.html`（建置費展示區塊，約第 60 行起）
- Modify: `js/app.js`（新增 mlBuildPackages、mlBuildOneTimeNotes computed）

- [ ] **Step 1: 在 app.js computed 新增兩個展示用計算**

在 `mlRetrainingOptions()` 後新增：

```js
    // 彙整所有選取來源的 buildPackages（用於建置費說明）
    mlBuildPackages() {
      return this.mlConfig.sources.flatMap(src =>
        (AI_WORKLOAD_TEMPLATES[src] || {}).buildPackages || []
      )
    },
    // 彙整所有首次訓練工時說明（buildOneTimeNote，非 null 的）
    mlBuildOneTimeNotes() {
      return this.mlConfig.sources
        .map(src => (AI_WORKLOAD_TEMPLATES[src] || {}).buildOneTimeNote)
        .filter(Boolean)
    },
```

- [ ] **Step 2: 在 index.html 建置費區塊加入工作包說明**

找到建置費展示區（約第 60 行）的 `<div class="cost-detail">` 的結尾，在建置費的 `cost-row` 結束前插入：

```html
              <!-- AI/ML 建置工作包說明（不逐項報價，僅說明已含範疇） -->
              <template v-if="hasAiMl && mlBuildPackages.length > 0">
                <div class="build-packages-section">
                  <div class="build-packages-title">已含 AI/ML 建置工作範疇：</div>
                  <div class="build-packages-list">
                    <span v-for="pkg in mlBuildPackages" :key="pkg" class="build-package-tag">✓ {{ pkg }}</span>
                  </div>
                  <div v-for="note in mlBuildOneTimeNotes" :key="note" class="build-onetime-note">
                    📌 {{ note }}
                  </div>
                </div>
              </template>
```

- [ ] **Step 3: 在 css/main.css 新增對應樣式**

在末尾新增：

```css
/* AI/ML 設定器 */
.ml-configurator { border-left: 3px solid #6366f1; }
.ml-config-note  { font-size: 0.82em; color: #888; margin-bottom: 10px; }
.ml-section-label { font-size: 0.88em; font-weight: 600; color: #555; margin-bottom: 6px; }

/* 建置費工作包說明 */
.build-packages-section { margin-top: 8px; padding: 8px 10px; background: #f8f9ff; border-radius: 6px; }
.build-packages-title   { font-size: 0.82em; color: #555; margin-bottom: 4px; }
.build-packages-list    { display: flex; flex-wrap: wrap; gap: 4px; }
.build-package-tag      { font-size: 0.78em; color: #444; background: #e8eaff; padding: 2px 7px; border-radius: 10px; }
.build-onetime-note     { font-size: 0.8em; color: #6366f1; margin-top: 6px; }
```

- [ ] **Step 4: Commit**

```bash
git add index.html js/app.js css/main.css
git commit -m "feat: 建置費 UI 展示 AI/ML 工作包說明與首次訓練工時備注"
```

---

## Task 8：補充測試

**Files:**
- Modify: `tests/calculator.test.js`

- [ ] **Step 1: 確認全部測試依然通過**

```bash
node tests/calculator.test.js
```
預期：全部 PASS

- [ ] **Step 2: 新增 ML 費用資料模型結構驗證測試**

在 `tests/calculator.test.js` 末尾新增（在 `console.log(...)` 前）：

```js
// ── AI_WORKLOAD_TEMPLATES 結構驗證 ──────────────────────────────────────────
const {
  AI_WORKLOAD_TEMPLATES, INFERENCE_ITEMS, RETRAINING_CLOUD, RETRAINING_MAINT_ADJ
} = require('../js/config.js')

const ML_SOURCES = ['llmApi', 'rag', 'fineTune', 'customTraining', 'traditionalML']
ML_SOURCES.forEach(src => {
  test(`AI_WORKLOAD_TEMPLATES.${src} 結構完整`, () => {
    const t = AI_WORKLOAD_TEMPLATES[src]
    if (!t) throw new Error('template 不存在')
    if (!Array.isArray(t.buildPackages)) throw new Error('buildPackages 應為陣列')
    if (!Array.isArray(t.cloudItems))   throw new Error('cloudItems 應為陣列')
    if (typeof t.buildStaffAdj.engineerDelta !== 'number') throw new Error('engineerDelta 應為數字')
    if (typeof t.buildStaffAdj.durationDelta !== 'number') throw new Error('durationDelta 應為數字')
  })
})

test('RETRAINING_CLOUD 鍵值完整', () => {
  const keys = ['none','once','yearly','quarterly','monthly']
  for (const k of keys) {
    if (typeof RETRAINING_CLOUD[k].monthlyNTD !== 'number') throw new Error(`RETRAINING_CLOUD.${k}.monthlyNTD 應為數字`)
  }
})

test('RETRAINING_MAINT_ADJ 鍵值完整', () => {
  const keys = ['none','once','yearly','quarterly','monthly']
  for (const k of keys) {
    if (typeof RETRAINING_MAINT_ADJ[k].pmMonthDelta !== 'number') throw new Error(`RETRAINING_MAINT_ADJ.${k}.pmMonthDelta 應為數字`)
  }
})

// ML 加成邊界測試（純函式模擬）
test('engineerDelta 加總後套用上限（engHigh=6, cap=3）', () => {
  // customTraining(+2) + fineTune(+1) + traditionalML(+1) = +4，cap=floor(6*0.5)=3
  const sources = ['customTraining', 'fineTune', 'traditionalML']
  const deltas = sources.map(s => AI_WORKLOAD_TEMPLATES[s].buildStaffAdj)
  const sumEng = deltas.reduce((s, d) => s + d.engineerDelta, 0)
  const capEng = Math.floor(6 * 0.5)  // tier L: engHigh=6
  expect(Math.min(sumEng, capEng)).toBe(3)
})

test('durationDelta 加總不超過上限 10', () => {
  const sources = ['customTraining', 'fineTune', 'traditionalML']
  const deltas = sources.map(s => AI_WORKLOAD_TEMPLATES[s].buildStaffAdj)
  const sumDur = deltas.reduce((s, d) => s + d.durationDelta, 0)  // 2+1+1=4
  expect(Math.min(sumDur, 10)).toBe(4)
})
```

- [ ] **Step 3: 跑全部測試，確認通過**

```bash
node tests/calculator.test.js
```
預期：全部 PASS

- [ ] **Step 4: Commit**

```bash
git add tests/calculator.test.js
git commit -m "test: 新增 ML 費用資料模型結構驗證與加成邊界測試"
```

---

## 自我審查

### Spec 覆蓋確認

| Spec 需求 | 對應 Task |
|-----------|-----------|
| Q8 擴充為 5 選一，更新 WEIGHTS.q8 | Task 1 |
| Q8 與設定器同步規則（自動升級） | Task 3 Step 5 |
| AI_WORKLOAD_TEMPLATES 等 4 個常數 | Task 2 |
| mlConfig 狀態（sources/inferenceType/retrainingFreq） | Task 3 |
| hasAiMl / mlStaffAdj / mlMaintAdj / mlAdjustedOverrides computed | Task 3 |
| costs() 使用 mlAdjustedOverrides | Task 3 |
| cloudBreakdown() hasAI 條件更新 | Task 4 |
| cloudBreakdown() ML 工作負載費用（workloadAiItems） | Task 4 |
| cloudBreakdown() 推論費（inferenceItems） | Task 4 |
| cloudBreakdown() 重訓 GPU 工時（retrainingCloudItems） | Task 4 |
| cloudBreakdown() 去重（legacyAi vs workloadAi） | Task 4 |
| AI/ML 設定器 UI（3 個維度） | Task 5 |
| 雲端費 UI 展示 ML 工作負載 | Task 6 |
| 建置費 UI 展示 AI/ML 工作包說明 | Task 7 |
| 首次訓練工時 buildOneTimeNote 展示 | Task 7 |
| effectiveBuild / effectiveMaint 使用 mlAdjustedOverrides | Task 3 |
| 過渡期：CLOUD_TEMPLATES.ai 保留，以 workloadIds 去重 | Task 4 |
| 測試更新（Q8 評分）及新增（資料結構/加成上限） | Task 1, Task 8 |

### 類型一致性確認

- `AI_WORKLOAD_TEMPLATES` 的 key：`llmApi`, `rag`, `fineTune`, `customTraining`, `traditionalML`
  — 在 Task 3 `mlStaffAdj`、Task 4 `workloadAiItems`、Task 5 UI 中均使用相同 key ✓
- `mlConfig.sources` 是字串陣列 → `mlStaffAdj` 用 `.map(src => AI_WORKLOAD_TEMPLATES[src])` ✓
- `RETRAINING_CLOUD` / `RETRAINING_MAINT_ADJ` 鍵：`none`, `once`, `yearly`, `quarterly`, `monthly`
  — Task 2 定義，Task 4 使用，Task 8 測試 ✓
- `INFERENCE_ITEMS` 鍵：`apiMetered`, `onlineEndpoint`, `batchInference`, `mixed`
  — Task 2 定義，Task 4 使用，Task 5 UI 使用 ✓
- `mlItems` 在 `cloudBreakdown()` return 中新增 → Task 6 UI 引用 `cloudBreakdown.mlItems` ✓
