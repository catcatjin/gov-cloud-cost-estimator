// Vue 3 Options API
// 依賴全域變數：WEIGHTS、TIER_DEFAULTS、CLOUD_TEMPLATES、AI_QUERY_MAP_Q1、AI_QUERY_MAP_Q2（config.js）
//              calcScore、calcTier、calcCosts（calculator.js）
//              loadPricingSync、loadPricingFetch、getPricingStatus（pricing.js）

// 用量計費項目的顯示說明（官方費率 × 估算用量）
function _unitNote(unitPrice, estimatedUsage, usageUnit) {
  if (unitPrice == null) return null
  return `${unitPrice.toFixed(2)} TWD/${usageUnit} × 估算 ${estimatedUsage} ${usageUnit}/月`
}

const { createApp } = Vue

const QUESTIONS = [
  {
    id: 'q1', title: '① 使用者規模',
    options: [
      { key: 'a', label: '內部少數員工（< 100 人）',      shortLabel: '內部少數' },
      { key: 'b', label: '全員使用（100–10,000 人）',      shortLabel: '全員' },
      { key: 'c', label: '有限民眾（< 10 萬人）',          shortLabel: '有限民眾' },
      { key: 'd', label: '大量民眾（10 萬–1,000 萬人）',  shortLabel: '大量民眾' },
      { key: 'e', label: '全國規模（> 1,000 萬人）',       shortLabel: '全國' },
    ],
  },
  {
    id: 'q2', title: '② 年度交易/處理量',
    options: [
      { key: 'a', label: '< 1 萬筆',        shortLabel: '<1萬' },
      { key: 'b', label: '1–10 萬筆',        shortLabel: '1-10萬' },
      { key: 'c', label: '10–100 萬筆',      shortLabel: '10-100萬' },
      { key: 'd', label: '100–1,000 萬筆',   shortLabel: '100-1000萬' },
      { key: 'e', label: '> 1,000 萬筆',     shortLabel: '>1000萬' },
    ],
  },
  {
    id: 'q3', title: '③ 資料機敏等級',
    options: [
      { key: 'a', label: '公開資訊',           shortLabel: '公開' },
      { key: 'b', label: '一般個人資料',         shortLabel: '一般個資' },
      { key: 'c', label: '特種個人資料',         shortLabel: '特種個資' },
      { key: 'd', label: '高度機密/國安等級',    shortLabel: '高度機密' },
    ],
  },
  {
    id: 'q4', title: '④ 外部系統介接數',
    options: [
      { key: 'a', label: '無介接',            shortLabel: '無' },
      { key: 'b', label: '1–2 個系統',        shortLabel: '1-2個' },
      { key: 'c', label: '3–5 個系統',        shortLabel: '3-5個' },
      { key: 'd', label: '6 個以上',           shortLabel: '6個以上' },
    ],
  },
  {
    id: 'q5', title: '⑤ 金流處理',
    options: [
      { key: 'a', label: '無金流',                   shortLabel: '無' },
      { key: 'b', label: '單一支付通道',             shortLabel: '單通道' },
      { key: 'c', label: '多通道 + 對帳/退款',       shortLabel: '多通道' },
    ],
  },
  {
    id: 'q6', title: '⑥ 尖峰流量倍率',
    options: [
      { key: 'a', label: '< 2x（無明顯尖峰）',        shortLabel: '<2x' },
      { key: 'b', label: '2–5x（季節性波動）',         shortLabel: '2-5x' },
      { key: 'c', label: '5–20x（集中申辦期）',        shortLabel: '5-20x' },
      { key: 'd', label: '> 20x（爆發式全民活動）',    shortLabel: '>20x' },
    ],
  },
  {
    id: 'q7', title: '⑦ 可用性要求',
    options: [
      { key: 'a', label: '上班時間（5×8）',                              shortLabel: '5x8' },
      { key: 'b', label: '7×24，可短暫停機修復',                          shortLabel: '7x24基本' },
      { key: 'c', label: '7×24，99.9% 以上 SLA（~8.7 小時/年停機上限）', shortLabel: '99.9%' },
      { key: 'd', label: '7×24，99.99% 以上 SLA（幾乎零停機）',           shortLabel: '99.99%' },
    ],
  },
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
]

createApp({
  data() {
    return {
      questions: QUESTIONS,
      answers: { q1: null, q2: null, q3: null, q4: null, q5: null, q6: null, q7: null, q8: null },
      weights: JSON.parse(JSON.stringify(WEIGHTS)), // 可變副本，供使用者調整
      overrides: {
        // 建置角色人數
        pmCount:       null,
        archCount:     null,
        engCountLow:   null,
        engCountHigh:  null,
        // 薪資（萬/人月）
        pmArchSal:     null,
        engSal:        null,
        // 期程（月）
        durationLow:   null,
        durationHigh:  null,
        // 維運人月/月
        maintMonthLow:  null,
        maintMonthHigh: null,
        // AI 月查詢量（次/月）
        aiMonthlyQueries: null,
      },
      // AI/ML 設定器狀態（不參與規模評分，只驅動費用計算）
      mlConfig: {
        sources:         [],    // 多選：'llmApi'|'rag'|'fineTune'|'customTraining'|'traditionalML'
        inferenceType:   null,  // 單選：'apiMetered'|'onlineEndpoint'|'batchInference'|'mixed'
        retrainingFreq:  null,  // 單選：'none'|'once'|'yearly'|'quarterly'|'monthly'
      },
      _syncingFromSources: false,
      showAdvanced: true,
      showWeights: false,
      pricingData: {},
      pricingMeta: {},
      checkedServices:   {},  // { [bundleId__serviceId]: boolean }
      serviceInstances:  {},  // { [bundleId__serviceId | base__serviceId]: number }
      serviceSelections: {},  // { [base__serviceId]: optionId }（selectable 下拉選項）
      expandedBundles:   {},  // { [bundleId]: boolean }
      pricingSource: 'unavailable',
      pricingLastUpdated: null,
      optionalAiOff: [],  // 被使用者取消勾選的 optional AI 項目 id
      copyStatus: '',
    }
  },

  computed: {
    effectiveTemplate() {
      return CLOUD_TEMPLATES[this.tier] || CLOUD_TEMPLATES['L']
    },
    derivedAiMonthlyQueries() {
      const q1 = AI_QUERY_MAP_Q1[this.answers.q1] || 0
      const q2 = AI_QUERY_MAP_Q2[this.answers.q2] || 0
      return Math.max(q1, q2)
    },
    effectiveAiMonthlyQueries() {
      return this.overrides.aiMonthlyQueries ?? this.derivedAiMonthlyQueries
    },
    score() {
      return calcScore(this.answers, this.weights)
    },
    tier() {
      return calcTier(this.score)
    },
    costs() {
      if (!this.allAnswered) return null
      return calcCosts(this.tier, this.mlAdjustedOverrides)
    },
    allAnswered() {
      return Object.values(this.answers).every(v => v !== null)
    },
    tierDefaults() {
      return TIER_DEFAULTS[this.tier] || {}
    },
    contingencyPct() {
      const c = this.tierDefaults.contingency
      if (!c) return 0
      return Math.round(c * 100)
    },
    cloudBufferPct() {
      const tpl = this.effectiveTemplate
      return tpl ? Math.round(tpl.buffer * 100) : 0
    },
    // 以 cloudBreakdown 實際互動雲端費重新計算預備金
    adjustedReserve() {
      if (!this.costs || this.costs.isXL || !this.cloudBreakdown) return 0
      const rate = this.tierDefaults.contingency || 0
      if (!rate) return 0
      return calcAdjustedReserve(this.costs.buildMid, this.cloudBreakdown.totalWan, this.costs.maintMid, rate)
    },
    // 以 cloudBreakdown 取代靜態 cloudLow/cloudHigh 計算一年期總費
    adjustedTotalLow() {
      if (!this.costs || this.costs.isXL || !this.cloudBreakdown) return null
      return calcAdjustedTotalLow(this.costs.buildLow, this.cloudBreakdown.totalWan, this.costs.maintLow, this.adjustedReserve)
    },
    adjustedTotalHigh() {
      if (!this.costs || this.costs.isXL || !this.cloudBreakdown) return null
      return calcAdjustedTotalHigh(this.costs.buildHigh, this.cloudBreakdown.totalWan, this.costs.maintHigh, this.adjustedReserve)
    },
    cloudBreakdown() {
      if (this.pricingSource === 'unavailable') return null
      if (!this.allAnswered) return null
      const tpl = this.effectiveTemplate
      if (!tpl) return null
      const hasAI = this.answers.q8 !== 'a' && this.answers.q8 !== null
      const isXL  = this.tier === 'XL'

      // 基礎平台
      const baseItems = tpl.base.map(item => {
        const key = 'base__' + item.id
        const effectiveInstances = item.adjustable
          ? (this.serviceInstances[key] ?? item.instances)
          : item.instances
        let monthlyNTD = 0
        let selectedOption = null
        if (item.type === 'selectable') {
          const selId = this.serviceSelections[key] ?? item.defaultOption
          selectedOption = item.options.find(o => o.id === selId) ?? item.options[0]
          const unitPrice = selectedOption.sku
            ? (this.pricingData[selectedOption.sku] || selectedOption.monthlyNTD || 0)
            : (selectedOption.monthlyNTD || 0)
          monthlyNTD = unitPrice * effectiveInstances
        } else if (item.unitSku) {
          const unitPrice = this.pricingData[item.unitSku] ?? (item.monthlyNTD / (item.estimatedUsage || 1))
          monthlyNTD = unitPrice * (item.estimatedUsage || 1) * effectiveInstances
        } else if (item.sku) {
          monthlyNTD = (this.pricingData[item.sku] || 0) * effectiveInstances
        } else {
          monthlyNTD = (item.monthlyNTD || 0) * effectiveInstances
        }
        const yearWan = monthlyNTD * 12 / 10000
        const computedNote = item.unitSku
          ? _unitNote(this.pricingData[item.unitSku], item.estimatedUsage, item.usageUnit)
          : null
        return { ...item, key, effectiveInstances, selectedOption, yearWan: Math.round(yearWan * 10) / 10, computedNote }
      })

      // bundle dynamic-base 參照用：base item id → 每台月費單價
      const baseUnitPrice = {}
      for (const item of baseItems) {
        if (item.type === 'selectable' && item.selectedOption) {
          baseUnitPrice[item.id] = item.selectedOption.sku
            ? (this.pricingData[item.selectedOption.sku] || item.selectedOption.monthlyNTD || 0)
            : (item.selectedOption.monthlyNTD || 0)
        } else {
          baseUnitPrice[item.id] = item.monthlyNTD || 0
        }
      }

      // 預先收集 ML workload 的 item IDs，用於去重 CLOUD_TEMPLATES.ai 舊版項目
      const workloadIds = this.hasAiMl
        ? new Set(this.mlConfig.sources.flatMap(src =>
            (AI_WORKLOAD_TEMPLATES[src]?.cloudItems || []).map(i => i.id)
          ))
        : new Set()

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

      // ML 工作負載雲端費（從 AI_WORKLOAD_TEMPLATES，排除首次訓練工時）
      // 以 Set 去除跨來源重複的 item.id（例如 mlWorkspace 可能出現在多個來源）
      const seenWorkloadIds = new Set()
      const workloadAiItems = this.hasAiMl ? this.mlConfig.sources.flatMap(src => {
        const tpl2 = AI_WORKLOAD_TEMPLATES[src]
        if (!tpl2) return []
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
      }).filter(item => {
        if (seenWorkloadIds.has(item.id)) return false
        seenWorkloadIds.add(item.id)
        return true
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

      // 需求包
      const bundles = tpl.bundles.map(bundle => {
        const items = bundle.items.map(svc => {
          const key            = bundle.id + '__' + svc.id
          const svcChecked     = !!this.checkedServices[key]
          const effectiveInstances = svc.adjustable
            ? (this.serviceInstances[key] ?? svc.instances)
            : svc.instances
          let unitMonthly
          if (svc.type === 'dynamic-base') {
            unitMonthly = baseUnitPrice[svc.baseRef] || 0
          } else if (svc.unitSku) {
            const unitPrice = this.pricingData[svc.unitSku] ?? (svc.monthlyNTD / (svc.estimatedUsage || 1))
            unitMonthly = unitPrice * (svc.estimatedUsage || 1)
          } else {
            unitMonthly = svc.monthlyNTD || 0
          }
          const monthlyNTD     = svcChecked ? unitMonthly * effectiveInstances : 0
          const yearWan        = monthlyNTD * 12 / 10000
          const computedNote   = svc.unitSku
            ? _unitNote(this.pricingData[svc.unitSku], svc.estimatedUsage, svc.usageUnit)
            : null
          return { ...svc, key, svcChecked, effectiveInstances, yearWan: Math.round(yearWan * 10) / 10, computedNote }
        })
        const bundleYearWan = items.reduce((s, i) => s + i.yearWan, 0)
        const isExpanded    = !!this.expandedBundles[bundle.id]
        return { ...bundle, items, bundleYearWan: Math.round(bundleYearWan * 10) / 10, isExpanded }
      })

      const baseWan     = baseItems.reduce((s, i) => s + i.yearWan, 0)
      const aiWan       = aiItems.reduce((s, i) => s + i.yearWan, 0)
      const mlWan       = mlItems.reduce((s, i) => s + i.yearWan, 0)
      const bundleWan   = bundles.reduce((s, b) => s + b.bundleYearWan, 0)
      const subtotalWan = baseWan + aiWan + mlWan + bundleWan
      const totalWan    = subtotalWan * (1 + tpl.buffer)
      // 所有 optional AI 項目（含已取消勾選的），供 UI 渲染 checkbox
      // 排除已由 AI_WORKLOAD_TEMPLATES 接管的項目（避免重複顯示）
      const optionalAiAll = hasAI ? tpl.ai.filter(item => item.optional && !workloadIds.has(item.id)).map(item => ({
        ...item,
        checked: !this.optionalAiOff.includes(item.id),
      })) : []

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
    },
    effectiveBuild() {
      const t = this.tierDefaults
      const o = this.mlAdjustedOverrides
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
      const o = this.mlAdjustedOverrides
      const r = t.roles || {}
      return {
        pmLow:  o.maintMonthLow  ?? t.maintMonthLow,
        pmHigh: o.maintMonthHigh ?? t.maintMonthHigh,
        engSal: o.engSal ?? r.engSal ?? 28,
      }
    },

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
        const durCap = Math.max(t.durationHigh || 12, 18)
        if (o.durationLow  === null) o.durationLow  = Math.min((t.durationLow  || 6)  + durationDelta, durCap)
        if (o.durationHigh === null) o.durationHigh = Math.min((t.durationHigh || 12) + durationDelta, durCap)
      }

      const aiMaintAdj = 0.2
      const ragAdj = this.mlConfig.sources.includes('rag') ? 0.15 : 0
      const totalMaintAdj = aiMaintAdj + ragAdj + this.mlMaintAdj
      if (o.maintMonthLow  === null) o.maintMonthLow  = +((t.maintMonthLow  || 0) + totalMaintAdj).toFixed(2)
      if (o.maintMonthHigh === null) o.maintMonthHigh = +((t.maintMonthHigh || 0) + totalMaintAdj + 0.1).toFixed(2)

      return o
    },

    // 設定器模型來源對應的最低 Q8 等級（用於 Q8 同步規則）
    mlSourceQ8Level() {
      const SOURCE_MIN = { llmApi: 'b', rag: 'c', fineTune: 'd', traditionalML: 'd', customTraining: 'e' }
      const ORDER = ['a', 'b', 'c', 'd', 'e']
      if (this.mlConfig.sources.length === 0) return null
      return this.mlConfig.sources
        .map(s => SOURCE_MIN[s] || 'b')
        .reduce((max, lvl) => ORDER.indexOf(lvl) > ORDER.indexOf(max) ? lvl : max, 'b')
    },

    // 靜態選項列表（供 UI 渲染 AI/ML 設定器）
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

    // 彙整所有選取來源的 buildPackages（用於建置費說明）
    mlBuildPackages() {
      return this.mlConfig.sources.flatMap(src =>
        (AI_WORKLOAD_TEMPLATES[src] || {}).buildPackages || []
      )
    },
    // 彙整所有首次訓練工時說明（非 null 的）
    mlBuildOneTimeNotes() {
      return this.mlConfig.sources
        .map(src => (AI_WORKLOAD_TEMPLATES[src] || {}).buildOneTimeNote)
        .filter(Boolean)
    },
  },

  methods: {
    fmt(n) {
      return Math.round(n || 0)
    },

    formatQueries(n) {
      if (!n) return '0'
      if (n >= 10000000) return (n / 10000000).toFixed(1) + '千萬'
      if (n >= 1000000)  return (n / 1000000).toFixed(1) + '百萬'
      if (n >= 10000)    return (n / 10000).toFixed(1) + '萬'
      return n.toLocaleString('zh-TW')
    },

    adjustRole(field, delta) {
      const ROLE_CONFIG = {
        pmCount:   { defKey: 'pm',   max: 3 },
        archCount: { defKey: 'arch', max: 2 },
      }
      const cfg = ROLE_CONFIG[field]
      if (!cfg) return
      const r       = this.tierDefaults.roles || {}
      const current = this.overrides[field] ?? (r[cfg.defKey] ?? 0)
      this.overrides[field] = Math.min(cfg.max, Math.max(0, current + delta))
    },

    resetWeights() {
      this.weights = JSON.parse(JSON.stringify(WEIGHTS))
    },

    autoSelectBundles() {
      const tpl = this.effectiveTemplate
      if (!tpl) return
      const isXL = this.tier === 'XL'
      const newCheckedServices = {}
      for (const bundle of tpl.bundles) {
        const shouldCheck = !isXL && bundle.autoSelect(this.answers, this.tier)
        for (const svc of bundle.items) {
          newCheckedServices[bundle.id + '__' + svc.id] = shouldCheck
        }
      }
      this.checkedServices  = newCheckedServices
      this.expandedBundles  = {}
    },

    getBundleChecked(bundleId) {
      const tpl = this.effectiveTemplate
      if (!tpl) return false
      const bundle = tpl.bundles.find(b => b.id === bundleId)
      if (!bundle) return false
      return bundle.items.some(svc => !!this.checkedServices[bundleId + '__' + svc.id])
    },

    getBundleIndeterminate(bundleId) {
      const tpl = this.effectiveTemplate
      if (!tpl) return false
      const bundle = tpl.bundles.find(b => b.id === bundleId)
      if (!bundle) return false
      const checkedCount = bundle.items.filter(svc => !!this.checkedServices[bundleId + '__' + svc.id]).length
      return checkedCount > 0 && checkedCount < bundle.items.length
    },

    toggleBundle(bundleId) {
      const tpl = this.effectiveTemplate
      if (!tpl) return
      const bundle = tpl.bundles.find(b => b.id === bundleId)
      if (!bundle) return
      const newVal = !this.getBundleChecked(bundleId)
      const newSvcs = { ...this.checkedServices }
      for (const svc of bundle.items) {
        newSvcs[bundleId + '__' + svc.id] = newVal
      }
      this.checkedServices = newSvcs
    },

    toggleService(bundleId, serviceId) {
      const key    = bundleId + '__' + serviceId
      const newVal = !this.checkedServices[key]
      this.checkedServices = { ...this.checkedServices, [key]: newVal }
    },

    setServiceInstance(key, value, min, max) {
      const clamped = Math.min(max ?? 99, Math.max(min ?? 1, Math.round(value) || 1))
      this.serviceInstances = { ...this.serviceInstances, [key]: clamped }
    },

    setServiceSelection(key, optionId) {
      this.serviceSelections = { ...this.serviceSelections, [key]: optionId }
    },

    toggleBundleExpand(bundleId) {
      this.expandedBundles = { ...this.expandedBundles, [bundleId]: !this.expandedBundles[bundleId] }
    },

    toggleOptionalAi(id) {
      if (this.optionalAiOff.includes(id)) {
        this.optionalAiOff = this.optionalAiOff.filter(x => x !== id)
      } else {
        this.optionalAiOff = [...this.optionalAiOff, id]
      }
    },


    copyResult() {
      if (!this.allAnswered) return
      const text = this.generateResultText()
      navigator.clipboard.writeText(text).then(() => {
        this.copyStatus = 'copied'
        setTimeout(() => { this.copyStatus = '' }, 2000)
      }).catch(() => {
        // clipboard API 在 file:// 協議下可能被限制，降回 prompt
        prompt('複製以下文字：', text)
      })
    },

    generateResultText() {
      const c = this.costs
      if (!c && this.tier !== 'XL') return '（計算錯誤，請重新選擇問卷選項）'
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
      const sourceLabel = this.pricingSource === 'github-pages'
        ? `GitHub Actions 自動維護（${this.pricingLastUpdated} 更新）`
        : this.pricingSource === 'localStorage'
          ? `快取費率（${this.pricingLastUpdated}，上次 GitHub Pages 更新）`
          : `費率未載入`

      const lines = [
        '## 政府資訊系統規模估算',
        `估算時間：${now}`,
        `量級：${this.tier}（總分 ${this.score} 分）`,
        `費率來源：${sourceLabel}`,
        '',
        '【費用估算】',
      ]

      if (this.tier === 'XL') {
        lines.push('量級 XL 費用高度客製化，請洽請廠商評估。')
        if (this.cloudBreakdown && this.cloudBreakdown.totalWan > 0) {
          lines.push(`雲端費用參考（L 量級費率）：${this.cloudBreakdown.totalWan.toFixed(1)} 萬（實際需議價）`)
        } else {
          lines.push(`雲端年費基準：500–3,000 萬（含 ${this.cloudBufferPct}% 緩衝，XL 規模實際需議價）`)
        }
      } else {
        const eb = this.effectiveBuild
        const engRange = eb.engLow === eb.engHigh ? String(eb.engLow) : `${eb.engLow}–${eb.engHigh}`
        const roleDesc = eb.archCount > 0
          ? `${eb.pmCount} PM × ${eb.pmArchSal}萬 + ${eb.archCount} 架構師 × ${eb.pmArchSal}萬 + ${engRange} 工程師 × ${eb.engSal}萬`
          : `${eb.pmCount} PM/架構師 × ${eb.pmArchSal}萬 + ${engRange} 工程師 × ${eb.engSal}萬`
        lines.push(`建置費：${this.fmt(c.buildLow)}–${this.fmt(c.buildHigh)} 萬（中位約 ${this.fmt(c.buildMid)} 萬）`)
        lines.push(`  角色：${roleDesc} × ${eb.durLow}–${eb.durHigh} 月`)
        const cloudTotal = this.cloudBreakdown ? this.cloudBreakdown.totalWan.toFixed(1) + '萬' : `${c.cloudLow}–${c.cloudHigh} 萬`
        lines.push(`雲端年費（含 ${this.cloudBufferPct}% 緩衝）：${cloudTotal}`)
        if (this.cloudBreakdown) {
          const checkedNames = this.cloudBreakdown.bundles
            .filter(b => this.getBundleChecked(b.id))
            .map(b => b.label)
          if (checkedNames.length > 0) lines.push(`  需求包：${checkedNames.join('、')}`)
        }
        lines.push(`維運費：${this.fmt(c.maintLow)}–${this.fmt(c.maintHigh)} 萬/年`)
        if (this.tier !== 'S') {
          lines.push(`預備金（${this.contingencyPct}%）：≈ ${this.fmt(this.adjustedReserve)} 萬`)
        }
        if (this.cloudBreakdown) {
          lines.push(`一年期總費：${this.fmt(this.adjustedTotalLow)}–${this.fmt(this.adjustedTotalHigh)} 萬`)
        } else {
          lines.push(`一年期總費：${this.fmt(c.totalLow)}–${this.fmt(c.totalHigh)} 萬（靜態估算）`)
        }
      }

      lines.push('', '【問卷答案】')
      for (const q of this.questions) {
        const choice = this.answers[q.id]
        if (choice !== null) {
          const opt = q.options.find(o => o.key === choice)
          const pts = this.weights?.[q.id]?.[choice] ?? '?'
          lines.push(`${q.title}：${opt ? opt.label : choice}（+${pts} 分）`)
        }
      }

      if (this.hasAiMl) {
        lines.push('', '【AI 費用】')
        const src = this.overrides.aiMonthlyQueries != null ? '手動設定' : 'Q1/Q2 推算'
        lines.push(`月查詢量：${this.effectiveAiMonthlyQueries.toLocaleString('zh-TW')} 次（${src}）`)
      }

      if (this.hasAiMl && this.mlConfig.sources.length > 0) {
        const srcLabels = {
          llmApi: 'LLM API', rag: 'RAG 知識庫', fineTune: 'Fine-tune',
          customTraining: '自訓練模型', traditionalML: '傳統 ML'
        }
        const inferLabels = {
          apiMetered: 'API 計量', onlineEndpoint: '常駐 endpoint',
          batchInference: '批次推論', mixed: '混合推論'
        }
        const retLabels = {
          none: '不重訓', once: '一次性', yearly: '每年', quarterly: '每季', monthly: '每月'
        }
        lines.push(`AI/ML 工作負載：${this.mlConfig.sources.map(s => srcLabels[s] || s).join('、')}`)
        if (this.mlConfig.inferenceType) lines.push(`推論方式：${inferLabels[this.mlConfig.inferenceType] || this.mlConfig.inferenceType}`)
        if (this.mlConfig.retrainingFreq && this.mlConfig.retrainingFreq !== 'none') lines.push(`訓練頻率：${retLabels[this.mlConfig.retrainingFreq] || this.mlConfig.retrainingFreq}`)
      }

      const tweaked = []
      if (this.overrides.durationLow    != null) tweaked.push(`期程低端：${this.overrides.durationLow} 月`)
      if (this.overrides.durationHigh   != null) tweaked.push(`期程高端：${this.overrides.durationHigh} 月`)
      if (this.overrides.pmCount        != null) tweaked.push(`PM 人數：${this.overrides.pmCount}`)
      if (this.overrides.archCount      != null) tweaked.push(`架構師人數：${this.overrides.archCount}`)
      if (this.overrides.engCountLow    != null) tweaked.push(`工程師人數低端：${this.overrides.engCountLow}`)
      if (this.overrides.engCountHigh   != null) tweaked.push(`工程師人數高端：${this.overrides.engCountHigh}`)
      if (this.overrides.pmArchSal      != null) tweaked.push(`PM/架構師月成本：${this.overrides.pmArchSal} 萬`)
      if (this.overrides.engSal         != null) tweaked.push(`工程師月成本：${this.overrides.engSal} 萬`)
      if (this.overrides.maintMonthLow  != null) tweaked.push(`維運人月低端：${this.overrides.maintMonthLow}`)
      if (this.overrides.maintMonthHigh != null) tweaked.push(`維運人月高端：${this.overrides.maintMonthHigh}`)
      if (this.overrides.aiMonthlyQueries != null) tweaked.push(`月查詢量：${this.overrides.aiMonthlyQueries.toLocaleString('zh-TW')} 次`)
      if (tweaked.length > 0) {
        lines.push('', '【進階微調（已覆蓋預設值）】')
        lines.push(...tweaked)
      }

      return lines.join('\n')
    },
  },

  watch: {
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
    // 設定器模型來源改變時，自動將 Q8 升級至最高風險等級（不降級）
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
    tier(newTier, oldTier) {
      if (newTier !== oldTier && this.allAnswered) {
        this.serviceInstances  = {}
        this.serviceSelections = {}
        this.expandedBundles   = {}
        this.autoSelectBundles()
      }
    },
    // 只在「首次全部作答完成」時自動選需求包，之後答題變動不重設手動勾選
    allAnswered(newVal) {
      if (newVal) this.autoSelectBundles()
    },
  },

  async mounted() {
    // 立即從 localStorage 讀取（同步），讓 cloudBreakdown 不必等網路
    loadPricingSync()
    let status = getPricingStatus()
    this.pricingSource      = status.pricingSource
    this.pricingLastUpdated = status.pricingLastUpdated
    this.pricingData        = status.pricingData
    this.pricingMeta        = status.pricingMeta

    // 背景抓取最新 prices.json，完成後再更新一次
    await loadPricingFetch()
    status = getPricingStatus()
    this.pricingSource      = status.pricingSource
    this.pricingLastUpdated = status.pricingLastUpdated
    this.pricingData        = status.pricingData
    this.pricingMeta        = status.pricingMeta
  },
}).mount('#app')
