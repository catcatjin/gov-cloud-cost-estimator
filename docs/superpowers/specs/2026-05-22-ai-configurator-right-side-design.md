# AI/ML 設定器移至右側費用區 — 設計文件

## 目標

將 AI/ML 工作負載設定器從左側問卷區移至右側費用明細區，使 AI 設定與費用即時連動，並清理左側問卷。同步移除 `CLOUD_TEMPLATES.ai`，讓 `AI_WORKLOAD_TEMPLATES` 成為唯一 AI/ML 費用來源。

## 角色分工（定案）

- **左側 Q8**：只做 AI/ML 風險分級，不負責費用細節
- **右側 AI/ML 設定器**：負責費用細節（模型來源、月查詢量、推論方式、訓練頻率）
- **`AI_WORKLOAD_TEMPLATES`**：唯一 AI/ML 費用來源，`CLOUD_TEMPLATES.ai` 全部移除

---

## 架構決策

### 確認的設計方向

1. **設定器移至右側**：AI/ML 設定器放在右側費用明細「量級結果」之後、「建置費」之前
2. **Q8 自動預填 sources**：Q8 改變時帶入預設 sources，防止循環互打機制（見下）
3. **三個維度保留**：模型來源（多選）、推論方式（單選）、訓練頻率（單選）
4. **條件式顯示**：推論方式和訓練頻率只在選了「自有模型」時才出現
5. **月查詢量調整欄位**：從進階微調移至右側 AI 設定區，進階微調面板移除此欄

### 右側費用明細順序

```
量級結果（S / M / L / XL）
AI/ML 功能設定（Q8 !== 'a' 才顯示）
建置費
雲端年費
維運費
總費
```

AI 設定器放在最頂端因為它會同時影響建置費、雲端費、維運費。

### Q8 預填映射

| Q8 值 | 說明 | 預填 sources |
|-------|------|-------------|
| `a` | 不使用 AI/ML | `[]`（設定器不顯示）|
| `b` | 簡易 AI 功能 | `['rag']` |
| `c` | RAG + LLM | `['rag', 'llmApi']` |
| `d` | 含微調/自訓練 | `['fineTune']`（見說明）|

**Q8='d' 說明**：Q8='d' 涵蓋「fine-tune 或傳統 ML / 預測模型」，預設帶 `['fineTune']`。右側設定器顯示提示：「如為傳統 ML，可改選「傳統 ML / 預測模型」」。不拆分 Q8 選項（少改原則）。

### Q8 ↔ sources 雙向同步防循環

現有邏輯：`mlConfig.sources` 改變 → Q8 自動升級（不降）。
新增邏輯：`answers.q8` 改變 → 預填 sources。

兩個 watcher 有潛在循環風險，以同步旗標防止：

```js
data: {
  _syncingFromSources: false   // 旗標：sources → Q8 升級中，不觸發反向
}

watch: {
  'answers.q8'(newQ8) {
    if (this._syncingFromSources) return   // 由 sources 觸發的 Q8 升級，不反向預填
    const defaults = Q8_SOURCE_DEFAULTS[newQ8]
    if (!defaults) return
    // 只補不降：將 defaults 中不在 sources 的項目補入
    defaults.forEach(s => {
      if (!this.mlConfig.sources.includes(s)) this.mlConfig.sources.push(s)
    })
  },

  'mlConfig.sources'(newSources) {
    this._syncingFromSources = true
    // 現有升級邏輯（不降）
    // ...
    this.$nextTick(() => { this._syncingFromSources = false })
  }
}
```

規則：
- **使用者直接改 Q8** → 補入預設 sources（只補不降）
- **使用者改 sources** → 只升級 Q8，不觸發 sources 反向重設

### 條件顯示邏輯

```
sources 只有 llmApi / rag（API-based）
  → ② 推論方式：隱藏
  → ③ 訓練頻率：隱藏

sources 含 fineTune / customTraining / traditionalML（自有模型）
  → ② 推論方式：顯示（常駐 Endpoint / 批次推論 / 混合）
  → ③ 訓練頻率：顯示（不重訓 / 每年 / 每季 / 每月）
```

### RAG AI Search SKU：tier-aware

現況 `AI_WORKLOAD_TEMPLATES.rag.cloudItems` 固定使用 AI Search Basic，L 量級會低估。
更新為 tier-aware：

```js
// config.js — AI_WORKLOAD_TEMPLATES.rag
rag: {
  cloudItems: [
    {
      id: 'aiSearch',
      label: 'Azure AI Search',
      skuByTier: {
        S: 'AI Search Basic',
        M: 'AI Search Basic',
        L: 'AI Search Standard S1'
      }
    }
  ]
}
```

`cloudBreakdown` 計算時，依 `this.tier` 選對應 SKU，再查 `prices[sku]`。

---

## 元件設計

### 右側 AI 設定區塊

觸發條件：`answers.q8 && answers.q8 !== 'a'`

**① 模型來源（多選 checkbox）**

所有 `mlSourceOptions`，每項旁顯示年費。未勾選項呈灰色虛線框（保持可見）。

`llmApi` 勾選時，選項下方顯示月查詢量調整欄：
```
月查詢量：[_____ 次]  （placeholder = Q1/Q2 推算值）
```
- 綁定：`v-model.number="overrides.aiMonthlyQueries"`
- 清空自動 fallback 回推算值（`??` 語意）
- 進階微調面板移除此欄（右側為唯一入口）

Q8='d' 且 sources 含 `fineTune` 時，顯示提示文字：
```
如為傳統 ML，可改選「傳統 ML / 預測模型」
```

**② 推論方式（單選 radio）**

顯示條件：`mlConfig.sources.some(s => ['fineTune','customTraining','traditionalML'].includes(s))`

選項：常駐 Endpoint（T4 GPU）、批次推論（Spot GPU）、混合

**③ 訓練頻率（單選 radio）**

顯示條件：同②

選項：不重訓、每年、每季、每月，每項旁顯示費用差額

**AI 小計列**：`AI 功能小計：X.X 萬/年`

---

## 實作範圍與順序

### Task 1：移動設定器 UI（index.html）

- 移除左側 `.ml-configurator` div
- 右側費用明細頂端插入 AI 設定區（量級結果之後）
- 使用既有 `mlConfig` 綁定，月查詢量欄位移至此處
- 進階微調移除「月查詢量」tweak-row

### Task 2：Q8 預填 sources + 防循環（app.js）

- 新增 `Q8_SOURCE_DEFAULTS` 映射
- 新增 `answers.q8` watcher，帶同步旗標
- 調整 `mlConfig.sources` watcher，寫入 / 清除旗標

### Task 3：移除 CLOUD_TEMPLATES.ai（config.js + app.js + index.html）

移除清單：
- `config.js`：`CLOUD_TEMPLATES[tier].ai` 陣列
- `app.js`：`aiItems`、`optionalAiOff`、`optionalAiAll`、`toggleOptionalAi`、`workloadIds` 去重 legacy 邏輯、`aiWan`
- `index.html`：legacy「AI 功能」區塊（`aiItems`、`optionalAiAll` 迴圈）
- 相關註解

`cloudBreakdown()` 最終結構：
```
baseItems + mlItems + inferenceItems + retrainingItems + bundles
```

### Task 4：RAG tier-aware SKU（config.js + app.js）

- `AI_WORKLOAD_TEMPLATES.rag.cloudItems` 加入 `skuByTier`
- `cloudBreakdown` 計算 mlItems 時，依 `this.tier` 選 SKU

---

## 測試驗證場景

| 場景 | 預期結果 |
|------|---------|
| Q8='a' | 右側無 AI 設定區塊 |
| Q8='b' | rag 預選，② ③ 隱藏 |
| Q8='c' | llmApi+rag 預選，② ③ 隱藏，月查詢量欄出現 |
| Q8='d' | fineTune 預選，② ③ 出現，顯示傳統 ML 提示 |
| 手動勾 fineTune | ② ③ 出現 |
| 取消所有自有模型 | ② ③ 消失 |
| sources 改變 | Q8 只升不降，不觸發 sources 反向重設 |
| Q8 直接改 | sources 只補預設，不清除已選 |
| tier L + RAG | AI Search 使用 Standard S1（6300/月）|
| tier M + RAG | AI Search 使用 Basic（2100/月）|
| 費用計算 | AI 小計即時更新，建置費/維運費同步反映 |

---

## 不在本次範圍

- 費用數字與 prices.json 的動態連結（現況：`AI_WORKLOAD_TEMPLATES` 靜態定義）
- Q8 d 拆分成 fine-tune / 傳統 ML 兩個獨立選項
- 多語系 / 匯出 PDF
