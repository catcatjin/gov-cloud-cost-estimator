# AI/ML 設定器移至右側 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 AI/ML 設定器從左側問卷區移至右側費用區頂端，加入 Q8 自動預填與防循環同步，移除 `CLOUD_TEMPLATES.ai` legacy，並讓 RAG 的 AI Search SKU 依量級自動切換。

**Architecture:** 四個循序 Task，每個 Task 完成後 commit 並可瀏覽器驗證。Task 1 移動 UI，Task 2 加 watcher 邏輯，Task 3 刪 legacy，Task 4 補 tier-aware SKU。Vue 3 Options API，CDN 引入，無 build 工具，驗證靠瀏覽器手動測試。

**Tech Stack:** Vue 3 (CDN Options API), plain HTML/CSS/JS, Node.js tests (calculator.test.js)

---

## 檔案結構

| 檔案 | Task | 說明 |
|------|------|------|
| `index.html` | 1, 3 | 移除左側設定器、插入右側設定器、移除 legacy AI 功能區塊 |
| `css/main.css` | 1 | 新增右側 AI 設定器的 CSS 樣式 |
| `js/app.js` | 2, 3, 4 | 新增 Q8 watcher / 防循環旗標、移除 legacy aiItems/optionalAiOff/toggleOptionalAi、更新 RAG cloudItems 計算 |
| `js/config.js` | 3, 4 | 移除 CLOUD_TEMPLATES.ai 陣列、更新 AI_WORKLOAD_TEMPLATES.rag cloudItems |

---

## Task 1：移動設定器 UI

**Files:**
- Modify: `index.html`（左側移除 + 右側插入 + 進階微調移除月查詢量）
- Modify: `css/main.css`（新增 AI config panel 樣式）

### 背景

目前左側問卷區 `index.html:46–88` 有一個 `.ml-configurator` div，功能是 AI/ML 設定器。需要：
1. 完全移除這個左側 div
2. 在右側 `.panel-right` 的 `.tier-section`（line 97）之後插入新版設定器
3. 移除進階微調面板中的月查詢量欄位（目前在 line 339–341）
4. 新增對應 CSS 樣式

### 步驟

- [ ] **Step 1：移除左側 ml-configurator div**

在 `index.html`，刪除 lines 45–88（含注釋行），即整個從 `<!-- AI/ML 設定器（Q8 ≠ 'a' 才顯示） -->` 到最後那個 `</div>` 的區塊。

刪除這一整段：
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

          <!-- Q8 同步提示：Q8 已被自動同步至來源要求的等級時顯示 -->
          <div v-if="mlSourceQ8Level && mlSourceQ8Level === answers.q8 && answers.q8 !== 'a'"
            class="ml-sync-hint">
            ⚡ 依模型來源，Q8 已自動更新為最高風險等級
          </div>
        </div>
```

- [ ] **Step 2：在右側 tier-section 之後插入新版 AI 設定器**

在 `index.html` 找到：
```html
          <!-- 量級徽章 -->
          <div class="tier-section">
            <span class="tier-badge" :class="'tier-' + tier">量級 {{ tier }}</span>
            <span class="total-score">總分：{{ score }} 分</span>
          </div>

          <!-- 費用明細 -->
          <div class="cost-section">
```

在 `</div>` 和 `<!-- 費用明細 -->` 之間插入：
```html
          <!-- AI/ML 功能設定（Q8 ≠ 'a' 才顯示，置於費用明細最頂端） -->
          <div v-if="answers.q8 && answers.q8 !== 'a'" class="ai-config-panel">
            <div class="ai-config-header">⚙ AI/ML 功能設定</div>

            <!-- ① 模型來源（多選） -->
            <div class="ai-config-section-label">① 模型來源（可多選）</div>
            <div class="ai-config-sources">
              <label v-for="src in mlSourceOptions" :key="src.key"
                :class="['ai-source-item', { 'ai-source-checked': mlConfig.sources.includes(src.key) }]">
                <input type="checkbox" :value="src.key" v-model="mlConfig.sources">
                <span class="ai-source-label">{{ src.label }}</span>
              </label>
            </div>

            <!-- 月查詢量（llmApi 勾選時顯示） -->
            <div v-if="mlConfig.sources.includes('llmApi')" class="ai-query-row">
              <span class="ai-query-label">月查詢量</span>
              <input type="number" class="ai-query-input"
                v-model.number="overrides.aiMonthlyQueries"
                :placeholder="derivedAiMonthlyQueries" min="1">
              <span class="ai-query-unit">次/月（Q1/Q2 推算）</span>
            </div>

            <!-- Q8='d' + fineTune 時顯示傳統 ML 提示 -->
            <div v-if="answers.q8 === 'd' && mlConfig.sources.includes('fineTune') && !mlConfig.sources.includes('traditionalML')"
              class="ai-config-hint">
              如為傳統 ML，可改選「傳統 ML / 預測模型」
            </div>

            <!-- ② 推論方式（自有模型才顯示） -->
            <template v-if="mlConfig.sources.some(s => ['fineTune','customTraining','traditionalML'].includes(s))">
              <div class="ai-config-section-label">② 推論方式</div>
              <div class="ai-config-options">
                <label v-for="opt in mlInferenceOptions.filter(o => o.key !== 'apiMetered')" :key="opt.key"
                  :class="['ai-option-item', { 'ai-option-checked': mlConfig.inferenceType === opt.key }]">
                  <input type="radio" name="mlInferenceType" :value="opt.key" v-model="mlConfig.inferenceType">
                  <span>{{ opt.label }}</span>
                </label>
              </div>

              <!-- ③ 訓練頻率 -->
              <div class="ai-config-section-label">③ 訓練頻率</div>
              <div class="ai-config-options">
                <label v-for="opt in mlRetrainingOptions" :key="opt.key"
                  :class="['ai-option-item', { 'ai-option-checked': mlConfig.retrainingFreq === opt.key }]">
                  <input type="radio" name="mlRetrainingFreq" :value="opt.key" v-model="mlConfig.retrainingFreq">
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </template>

            <!-- Q8 同步提示 -->
            <div v-if="mlSourceQ8Level && mlSourceQ8Level === answers.q8 && answers.q8 !== 'a'"
              class="ml-sync-hint">
              ⚡ 依模型來源，Q8 已自動更新為最高風險等級
            </div>
          </div>

```

- [ ] **Step 3：移除進階微調面板中的月查詢量欄位**

在 `index.html` 找到並刪除：
```html
              <div class="tweak-row" v-if="hasAiMl">
                <label>月查詢量</label>
                <input type="number" v-model.number="overrides.aiMonthlyQueries" :placeholder="derivedAiMonthlyQueries" min="1">
                <span class="tweak-hint">由 Q1/Q2 推算</span>
              </div>
```

- [ ] **Step 4：新增 CSS 樣式至 css/main.css**

在 `css/main.css` 最末尾加入：
```css
/* AI/ML 功能設定器（右側版） */
.ai-config-panel {
  border: 1px solid #c5dcf5;
  border-radius: 6px;
  background: #f0f7ff;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 12px;
}
.ai-config-header {
  font-weight: 700;
  font-size: 11px;
  color: #1a56db;
  margin-bottom: 8px;
}
.ai-config-section-label {
  font-size: 10px;
  font-weight: 600;
  color: #555;
  margin: 8px 0 4px;
}
.ai-config-sources {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ai-source-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #dde;
  background: #fff;
  cursor: pointer;
}
.ai-source-item.ai-source-checked {
  border-color: #4299e1;
  background: #ebf8ff;
}
.ai-source-label {
  flex: 1;
  font-size: 11px;
  color: #2d3748;
}
.ai-query-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 2px 20px;
  font-size: 11px;
  color: #718096;
}
.ai-query-label { flex-shrink: 0; color: #555; }
.ai-query-input {
  width: 80px;
  padding: 2px 4px;
  border: 1px solid #cbd5e0;
  border-radius: 3px;
  font-size: 11px;
}
.ai-query-unit { color: #718096; font-size: 10px; }
.ai-config-hint {
  font-size: 10px;
  color: #805ad5;
  padding: 4px 6px;
  background: #faf5ff;
  border-radius: 3px;
  margin-top: 4px;
}
.ai-config-options {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ai-option-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #dde;
  background: #fff;
  cursor: pointer;
  font-size: 11px;
  color: #2d3748;
}
.ai-option-item.ai-option-checked {
  border-color: #4299e1;
  background: #ebf8ff;
}
```

- [ ] **Step 5：瀏覽器驗證**

用瀏覽器開 `index.html`，逐一驗證：

1. 完成 Q1–Q7 任意選項後回答 Q8='a' → 右側無出現 AI/ML 設定區塊
2. Q8 改為 'b'（有 AI 功能）→ 右側出現「⚙ AI/ML 功能設定」，顯示 ① 模型來源。量級徽章在設定器上方，建置費在設定器下方
3. 勾選「LLM API」→ 模型來源下方出現「月查詢量」輸入欄，placeholder 顯示推算數值
4. 輸入月查詢量覆蓋值 → 值改變（稍後 Task 3 完成後費用也會更新）
5. 只有 llmApi + rag → ② 推論方式 和 ③ 訓練頻率 不出現
6. 勾選「fine-tune」→ ② 推論方式 出現（只有 3 選項，沒有「API 計量」）；③ 訓練頻率 也出現
7. 取消 fine-tune → ② ③ 消失
8. 進階微調面板展開 → 確認「月查詢量」欄已不存在
9. 左側問卷區 → 確認舊的 AI/ML 工作負載設定 card 已消失

- [ ] **Step 6：Commit**

```bash
git add index.html css/main.css
git -c commit.gpgsign=false commit -m "feat: 移動 AI/ML 設定器至右側費用區（UI 移動）"
```

---

## Task 2：Q8 預填 sources + 防循環 watcher

**Files:**
- Modify: `js/app.js`

### 背景

需要在 `data()` 加入同步旗標 `_syncingFromSources`，新增 `answers.q8` watcher（Q8 改變時補入預設 sources），並更新既有的 `mlConfig.sources` watcher 以使用旗標防止循環。

### 步驟

- [ ] **Step 1：在 data() 加入同步旗標**

在 `js/app.js` 的 `data()` return 物件中，找到 `showAdvanced: true,` 這行，在它之前加入：
```js
      _syncingFromSources: false,
```

- [ ] **Step 2：在 watch 區塊加入 answers.q8 watcher**

在 `js/app.js` 的 `watch:` 區塊中，找到現有的 `'mlConfig.sources': {` watcher，在它之前加入：
```js
    'answers.q8'(newQ8) {
      // sources → Q8 升級觸發的改變，不反向重設，避免覆蓋 sources watcher 的升級結果
      if (this._syncingFromSources) return
      // 使用者直接改 Q8 → 重設為該 Q8 的預設 sources（清除舊選項）
      const defaults = {
        a: [],
        b: ['llmApi'],
        c: ['rag', 'llmApi'],
        d: ['fineTune'],
        e: ['customTraining'],
      }[newQ8] ?? []
      this.mlConfig.sources = [...defaults]
      // 若新 sources 不含自有模型，同步清除推論方式與訓練頻率
      const selfOwned = ['fineTune', 'customTraining', 'traditionalML']
      if (!defaults.some(s => selfOwned.includes(s))) {
        this.mlConfig.inferenceType  = null
        this.mlConfig.retrainingFreq = null
      }
    },
```

- [ ] **Step 3：更新 mlConfig.sources watcher 加入旗標**

找到現有的 `'mlConfig.sources': {` watcher：
```js
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
```

改為：
```js
    'mlConfig.sources': {
      handler() {
        const level = this.mlSourceQ8Level
        if (!level) return
        const ORDER = ['a', 'b', 'c', 'd', 'e']
        if (ORDER.indexOf(this.answers.q8 || 'a') < ORDER.indexOf(level)) {
          this._syncingFromSources = true
          this.answers.q8 = level
          this.$nextTick(() => { this._syncingFromSources = false })
        }
      },
      deep: true,
    },
```

- [ ] **Step 4：瀏覽器驗證**

1. 全部 Q1–Q7 選完後，Q8 選 'a'（不使用）→ 右側無設定器
2. Q8 改為 'b'（一般 LLM API）→ 右側設定器出現，① 模型來源中「LLM API」已勾選（預填），RAG 未勾選
3. Q8 改為 'c'（RAG+LLM）→ llmApi + rag 都已勾選（預填），舊選項被清除
4. Q8 改為 'd'（含微調）→ 只有 fineTune 已勾選（重設，llmApi/rag 也被清除）；② ③ 出現
5. Q8 改為 'e'（自訓練）→ 只有 customTraining 已勾選（重設）
6. Q8 改回 'a' → sources 清空，② ③ 消失
7. 驗證防循環：手動勾選 fineTune（sources watcher 升 Q8 至 'd'）→ Q8 watcher 因 `_syncingFromSources` 旗標跳過 → sources 不被重設為 ['fineTune']

- [ ] **Step 5：Commit**

```bash
git add js/app.js
git -c commit.gpgsign=false commit -m "feat: 加入 Q8 預填 sources watcher 與防循環旗標"
```

---

## Task 3：RAG tier-aware AI Search SKU

**Files:**
- Modify: `js/config.js`（`AI_WORKLOAD_TEMPLATES.rag.cloudItems` 加入 `skuByTier` 和 `monthlyNTDByTier`）
- Modify: `js/app.js`（`cloudBreakdown` 的 `workloadAiItems` 計算加入 `skuByTier` 處理）

### 背景

目前 `AI_WORKLOAD_TEMPLATES.rag.cloudItems` 固定用 `AI Search Basic`，L 量級應改用 `AI Search Standard S1`（月費 6300 vs 2100）。此 Task 在移除 legacy 前先完成，確保後續每個 commit 都不留已知低估。

### 步驟

- [ ] **Step 1：config.js 更新 rag.cloudItems**

找到：
```js
  rag: {
    buildPackages: ['RAG 架構設計', '知識庫資料清理與分塊', 'Embedding 索引建置', 'AI Search 設定', '檢索品質測試與調校'],
    buildOneTimeNote: null,
    cloudItems: [
      { id: 'aiSearch', label: 'Azure AI Search（基本）', sku: 'AI Search Basic', monthlyNTD: 2100 },
    ],
```

改為：
```js
  rag: {
    buildPackages: ['RAG 架構設計', '知識庫資料清理與分塊', 'Embedding 索引建置', 'AI Search 設定', '檢索品質測試與調校'],
    buildOneTimeNote: null,
    cloudItems: [
      {
        id: 'aiSearch',
        label: 'Azure AI Search',
        skuByTier: {
          S: 'AI Search Basic',
          M: 'AI Search Basic',
          L: 'AI Search Standard S1',
        },
        monthlyNTDByTier: {
          S: 2100,
          M: 2100,
          L: 6300,
        },
      },
    ],
```

- [ ] **Step 2：app.js 更新 workloadAiItems 以支援 skuByTier**

在 `cloudBreakdown` computed 中，找到 `workloadAiItems` 的 `.map(item => {` 內部，目前邏輯是：
```js
        return (tpl2.cloudItems || []).map(item => {
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
```

改為：
```js
        return (tpl2.cloudItems || []).map(item => {
          let monthlyNTD = 0
          let resolvedLabel = item.label
          if (item.type === 'ai-token') {
            const q = this.effectiveAiMonthlyQueries
            const unitPrice = this.pricingData[item.sku] || 0.16
            monthlyNTD = q * item.tokensPerQuery / 1000 * unitPrice
          } else if (item.skuByTier) {
            const sku = item.skuByTier[this.tier] ?? item.skuByTier['M']
            monthlyNTD = this.pricingData[sku] ?? (item.monthlyNTDByTier?.[this.tier] ?? 0)
            resolvedLabel = item.label + (this.tier === 'L' ? '（標準 S1）' : '（基本）')
          } else {
            monthlyNTD = item.sku
              ? (this.pricingData[item.sku] || item.monthlyNTD || 0)
              : (item.monthlyNTD || 0)
          }
          const yearWan = monthlyNTD * 12 / 10000
          return { ...item, label: resolvedLabel, yearWan: Math.round(yearWan * 10) / 10 }
        })
```

- [ ] **Step 3：執行 Node.js 測試**

```bash
node tests/calculator.test.js
node tests/adjusted-costs.test.js
```

預期：全部 ✓。

- [ ] **Step 4：瀏覽器驗證**

1. Q8='c'，選 rag，量級在 S 或 M → 右側「AI/ML 工作負載」顯示「Azure AI Search（基本）2.5 萬/年」
2. 調整問卷讓量級升至 L（Q1 選最大、Q2 選最大、Q3='d'、Q4='d'、Q5='c'、Q6='d'、Q7='d'，Q8='c'）→ 顯示「Azure AI Search（標準 S1）7.6 萬/年」
3. 量級切換時 AI Search 費用即時更新

- [ ] **Step 5：Commit**

```bash
git add js/config.js js/app.js
git -c commit.gpgsign=false commit -m "feat: RAG AI Search SKU 依量級自動切換（L 量級升 Standard S1）"
```

---

## Task 4：移除 CLOUD_TEMPLATES.ai legacy

**Files:**
- Modify: `js/config.js`（移除 S / M / L 的 `ai: [...]` 陣列）
- Modify: `js/app.js`（移除 aiItems / optionalAiOff / toggleOptionalAi / aiWan 等）
- Modify: `index.html`（移除 legacy「AI 功能」HTML 區塊）

### 背景

`CLOUD_TEMPLATES[tier].ai` 是舊版 AI 費用來源，現已全部由 `AI_WORKLOAD_TEMPLATES` 接管（Task 3 已修正 RAG tier-aware，此時移除無已知低估風險）。移除後 `cloudBreakdown` 只剩 `baseItems + mlItems + bundles`。

### 步驟

- [ ] **Step 1：config.js 移除三個 tier 的 ai 陣列**

在 `js/config.js` 找到以下三段，各自完整刪除（含 `ai: [` 開頭到對應 `],` 結尾）：

**S tier（約 line 78–82）：**
```js
    ai: [
      { id: 'openai', label: 'Azure OpenAI（GPT-4o）', type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
    ],
```

**M tier（約 line 153–157）：**
```js
    ai: [
      { id: 'openai',   label: 'Azure OpenAI（GPT-4o）',   type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
      { id: 'aiSearch', label: 'Azure AI Search（基本）（RAG / 語意搜尋）',  sku: 'AI Search Basic', monthlyNTD: 2100, instances: 1, optional: true },
    ],
```

**L tier（約 line 234–238）：**
```js
    ai: [
      { id: 'openai',   label: 'Azure OpenAI（GPT-4o）',       type: 'ai-token',
        sku: 'OpenAI GPT-4o Input', tokensPerQuery: 2000 },
      { id: 'aiSearch', label: 'Azure AI Search（標準 S1）（RAG / 語意搜尋）',   sku: 'AI Search Standard S1', monthlyNTD: 6300, instances: 1, optional: true },
    ],
```

- [ ] **Step 2：app.js 移除 optionalAiOff（data）**

找到 `data()` 中：
```js
      optionalAiOff: [],  // 被使用者取消勾選的 optional AI 項目 id
```
刪除這行。

- [ ] **Step 3：app.js 移除 cloudBreakdown 中的 hasAI / workloadIds / aiItems / optionalAiAll / aiWan 區塊**

在 `cloudBreakdown()` computed property 中：

**刪除（約 line 194）：**
```js
      const hasAI = this.answers.q8 !== 'a' && this.answers.q8 !== null
```

**刪除 workloadIds 區塊（約 lines 240–244）：**
```js
      // 預先收集 ML workload 的 item IDs，用於去重 CLOUD_TEMPLATES.ai 舊版項目
      const workloadIds = this.hasAiMl
        ? new Set(this.mlConfig.sources.flatMap(src =>
            (AI_WORKLOAD_TEMPLATES[src]?.cloudItems || []).map(i => i.id)
          ))
        : new Set()
```

**刪除 aiItems 計算區塊（約 lines 246–272，從注釋到 `) : []`）：**
```js
      // AI 功能（Q8 非 'a' 才包含，optional 項目依使用者勾選決定，排除已由 AI_WORKLOAD_TEMPLATES 提供的項目）
      const aiItems = hasAI ? tpl.ai.filter(item =>
        (!item.optional || !this.optionalAiOff.includes(item.id)) &&
        !workloadIds.has(item.id)   // 排除已由 AI_WORKLOAD_TEMPLATES 提供的項目
      ).map(item => {
        let monthlyNTD = 0
        let pricingNote = null
        if (item.type === 'ai-token') {
          const q         = this.effectiveAiMonthlyQueries
          const unitPrice = this.pricingData[item.sku] || 0.16
          monthlyNTD      = q * item.tokensPerQuery / 1000 * unitPrice
          const srcLabel  = this.pricingSource === 'github-pages' ? 'GitHub Actions'
            : this.pricingSource === 'localStorage' ? '快取'
            : '未載入'
          pricingNote     = `NTD ${unitPrice.toFixed(3)}/1K tokens（${srcLabel} ${this.pricingLastUpdated ?? ''}）`
        } else {
          // 有 sku 時優先從 pricingData 取官方價格
          const unitPrice = item.sku
            ? (this.pricingData[item.sku] || item.monthlyNTD || 0)
            : (item.monthlyNTD || 0)
          monthlyNTD = unitPrice * (item.instances ?? 1)
        }
        const yearWan = monthlyNTD * 12 / 10000
        return { ...item, yearWan: Math.round(yearWan * 10) / 10, pricingNote }
      }) : []
```

**刪除 optionalAiAll 計算區塊（約 lines 364–369）：**
```js
      // 所有 optional AI 項目（含已取消勾選的），供 UI 渲染 checkbox
      // 排除已由 AI_WORKLOAD_TEMPLATES 接管的項目（避免重複顯示）
      const optionalAiAll = hasAI ? tpl.ai.filter(item => item.optional && !workloadIds.has(item.id)).map(item => ({
        ...item,
        checked: !this.optionalAiOff.includes(item.id),
      })) : []
```

**更新 aiWan 和 subtotalWan（約 lines 357–362）：**

找到：
```js
      const baseWan     = baseItems.reduce((s, i) => s + i.yearWan, 0)
      const aiWan       = aiItems.reduce((s, i) => s + i.yearWan, 0)
      const mlWan       = mlItems.reduce((s, i) => s + i.yearWan, 0)
      const bundleWan   = bundles.reduce((s, b) => s + b.bundleYearWan, 0)
      const subtotalWan = baseWan + aiWan + mlWan + bundleWan
```

改為：
```js
      const baseWan     = baseItems.reduce((s, i) => s + i.yearWan, 0)
      const mlWan       = mlItems.reduce((s, i) => s + i.yearWan, 0)
      const bundleWan   = bundles.reduce((s, b) => s + b.bundleYearWan, 0)
      const subtotalWan = baseWan + mlWan + bundleWan
```

**更新 cloudBreakdown return（移除 aiItems 和 optionalAiAll）：**

找到：
```js
      return {
        baseItems,
        aiItems,
        mlItems,
        optionalAiAll,
        bundles,
        isXL,
        subtotalWan: Math.round(subtotalWan * 10) / 10,
        buffer: tpl.buffer,
        totalWan: Math.round(totalWan * 10) / 10,
      }
```

改為：
```js
      return {
        baseItems,
        mlItems,
        bundles,
        isXL,
        subtotalWan: Math.round(subtotalWan * 10) / 10,
        buffer: tpl.buffer,
        totalWan: Math.round(totalWan * 10) / 10,
      }
```

- [ ] **Step 4：app.js 移除 toggleOptionalAi method**

找到並刪除：
```js
    toggleOptionalAi(id) {
      if (this.optionalAiOff.includes(id)) {
        this.optionalAiOff = this.optionalAiOff.filter(x => x !== id)
      } else {
        this.optionalAiOff = [...this.optionalAiOff, id]
      }
    },
```

- [ ] **Step 5：index.html 移除 legacy「AI 功能」HTML 區塊**

找到並刪除整個 `<!-- AI 功能 -->` 區塊（包含必含 AI 項目和可選 AI 項目兩個 template）：

```html
                <!-- AI 功能 -->
                <template v-if="cloudBreakdown.aiItems.length > 0 || cloudBreakdown.optionalAiAll.length > 0">
                  <div class="bundle-section-header">AI 功能</div>
                  <!-- 必含 AI 項目 -->
                  <template v-for="item in cloudBreakdown.aiItems.filter(i => !i.optional)" :key="item.id">
                    <div class="cloud-item cloud-item-ai">
                      <span class="cloud-name">{{ item.label }}</span>
                      <span v-if="item.type === 'ai-token'" class="cloud-count-fixed">{{ formatQueries(effectiveAiMonthlyQueries) }} 次/月</span>
                      <span v-else class="cloud-count-fixed">× {{ item.instances }} 台</span>
                      <span class="cloud-cost">{{ item.yearWan.toFixed(1) }} 萬/年</span>
                    </div>
                    <div v-if="item.pricingNote" class="cloud-pricing-note">{{ item.pricingNote }}</div>
                    <div v-else-if="item.note" class="cloud-pricing-note">{{ item.note }}</div>
                  </template>
                  <!-- 可選 AI 項目（含取消勾選的） -->
                  <template v-for="item in cloudBreakdown.optionalAiAll" :key="'opt-' + item.id">
                    <div :class="['cloud-item', 'cloud-item-ai', { 'cloud-item-unchecked': !item.checked }]">
                      <label class="optional-ai-label">
                        <input type="checkbox" :checked="item.checked" @change="toggleOptionalAi(item.id)">
                        <span class="cloud-name">{{ item.label }}</span>
                      </label>
                      <span class="cloud-count-fixed">× {{ item.instances }} 台</span>
                      <span class="cloud-cost">
                        <template v-if="item.checked">
                          {{ cloudBreakdown.aiItems.find(i => i.id === item.id)?.yearWan.toFixed(1) }} 萬/年
                        </template>
                        <template v-else>— 萬/年</template>
                      </span>
                    </div>
                  </template>
                </template>
```

- [ ] **Step 6：執行現有 Node.js 測試確認無回歸**

```bash
cd /path/to/gov-cost-estimator-web
node tests/calculator.test.js
node tests/adjusted-costs.test.js
```

預期：全部 ✓，無 ✗。（這兩個測試測的是 calculator.js / adjusted-costs 邏輯，不直接測 cloudBreakdown，但確認 config.js 匯出正常。）

- [ ] **Step 7：瀏覽器驗證**

1. Q8='c'（RAG+LLM），勾選 llmApi + rag → 右側費用明細：只剩「基礎平台（必含）」、「AI/ML 工作負載」（含 OpenAI + AI Search）、「需求包」。舊的「AI 功能」區塊已消失
2. 雲端年費合計數字正確（基礎 + ML items + bundles，無 legacy aiItems）
3. Q8='a' → 右側費用明細無 AI/ML 工作負載區塊
4. 進階微調調整月查詢量（現在在右側 AI 設定器中輸入）→ OpenAI 費用即時更新

- [ ] **Step 8：Commit**

```bash
git add js/config.js js/app.js index.html
git -c commit.gpgsign=false commit -m "feat: 移除 CLOUD_TEMPLATES.ai legacy，AI_WORKLOAD_TEMPLATES 成為唯一 AI 費用來源"
```

---

---

## 完成後的人工驗算場景

完成全部 4 個 Task 後，用以下情境逐一確認費用正確：

| 情境 | 設定 | 預期 AI/ML 費用 |
|------|------|----------------|
| 基本 API | Q8='c', rag+llmApi, 月查詢 50000 | OpenAI: 50000×2000/1000×0.16×12/10000 = 1.92 萬/年；AI Search Basic: 2.52 萬/年 |
| L + RAG | 量級 L, rag | AI Search Standard S1: 6300×12/10000 = 7.56 萬/年 |
| fine-tune + 常駐推論 | fineTune + onlineEndpoint | ML Workspace + Endpoint 費用加總出現在「AI/ML 工作負載」 |
| 每季重訓 | retrainingFreq='quarterly' | 重訓 GPU 工時出現（4000×12/10000 = 4.8 萬/年）|
