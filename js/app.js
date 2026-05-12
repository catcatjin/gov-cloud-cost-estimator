// Vue 3 Options API
// 依賴全域變數：WEIGHTS、TIER_DEFAULTS、CLOUD_TEMPLATES、AI_QUERY_MAP_Q1、AI_QUERY_MAP_Q2（config.js）
//              calcScore、calcTier、calcCosts（calculator.js）
//              loadPricing、fetchAzurePrices、getPricingStatus（pricing.js）

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
    id: 'q8', title: '⑧ AI 功能',
    options: [
      { key: 'a', label: '無 AI 功能', shortLabel: '無' },
      { key: 'b', label: '有 AI 功能（如智慧客服、文件摘要）', shortLabel: '有' },
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
      showAdvanced: true,
      showWeights: false,
      pricingData: {},
      checkedServices:   {},  // { [bundleId__serviceId]: boolean }
      serviceInstances:  {},  // { [bundleId__serviceId | base__serviceId]: number }
      serviceSelections: {},  // { [base__serviceId]: optionId }（selectable 下拉選項）
      expandedBundles:   {},  // { [bundleId]: boolean }
      pricingSource: 'snapshot',
      pricingLastUpdated: null,
      pricingLoading: false,
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
      return calcCosts(this.tier, this.overrides)
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
    cloudBreakdown() {
      if (!this.allAnswered) return null
      const tpl = this.effectiveTemplate
      if (!tpl) return null
      const hasAI = this.answers.q8 === 'b'
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
        } else if (item.sku) {
          monthlyNTD = (this.pricingData[item.sku] || 0) * effectiveInstances
        } else {
          monthlyNTD = item.monthlyNTD * effectiveInstances
        }
        const yearWan = monthlyNTD * 12 / 10000
        return { ...item, key, effectiveInstances, selectedOption, yearWan: Math.round(yearWan * 10) / 10 }
      })

      // AI 功能（Q7='b' 才包含）
      const aiItems = hasAI ? tpl.ai.map(item => {
        let monthlyNTD = 0
        let pricingNote = null
        if (item.type === 'ai-token') {
          const q         = this.effectiveAiMonthlyQueries
          const unitPrice = this.pricingData[item.sku] || 0.16
          monthlyNTD      = q * item.tokensPerQuery / 1000 * unitPrice
          const srcLabel  = this.pricingSource === 'api' ? 'Azure API' : '快照'
          pricingNote     = `NTD ${unitPrice.toFixed(3)}/1K tokens（${srcLabel} ${this.pricingLastUpdated ?? ''}）`
        } else {
          monthlyNTD = item.monthlyNTD * (item.instances ?? 1)
        }
        const yearWan = monthlyNTD * 12 / 10000
        return { ...item, yearWan: Math.round(yearWan * 10) / 10, pricingNote }
      }) : []

      // 需求包
      const bundles = tpl.bundles.map(bundle => {
        const items = bundle.items.map(svc => {
          const key            = bundle.id + '__' + svc.id
          const svcChecked     = !!this.checkedServices[key]
          const effectiveInstances = svc.adjustable
            ? (this.serviceInstances[key] ?? svc.instances)
            : svc.instances
          const monthlyNTD     = svcChecked ? svc.monthlyNTD * effectiveInstances : 0
          const yearWan        = monthlyNTD * 12 / 10000
          return { ...svc, key, svcChecked, effectiveInstances, yearWan: Math.round(yearWan * 10) / 10 }
        })
        const bundleYearWan = items.reduce((s, i) => s + i.yearWan, 0)
        const isExpanded    = !!this.expandedBundles[bundle.id]
        return { ...bundle, items, bundleYearWan: Math.round(bundleYearWan * 10) / 10, isExpanded }
      })

      const baseWan     = baseItems.reduce((s, i) => s + i.yearWan, 0)
      const aiWan       = aiItems.reduce((s, i) => s + i.yearWan, 0)
      const bundleWan   = bundles.reduce((s, b) => s + b.bundleYearWan, 0)
      const subtotalWan = baseWan + aiWan + bundleWan
      const totalWan    = subtotalWan * (1 + tpl.buffer)
      return {
        baseItems,
        aiItems,
        bundles,
        isXL,
        subtotalWan: Math.round(subtotalWan * 10) / 10,
        buffer: tpl.buffer,
        totalWan: Math.round(totalWan * 10) / 10,
      }
    },
    effectiveBuild() {
      const t = this.tierDefaults
      const o = this.overrides
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
      const o = this.overrides
      const r = t.roles || {}
      return {
        pmLow:  o.maintMonthLow  ?? t.maintMonthLow,
        pmHigh: o.maintMonthHigh ?? t.maintMonthHigh,
        engSal: o.engSal ?? r.engSal ?? 28,
      }
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

    async refreshPricing() {
      this.pricingLoading = true
      try {
        const result = await fetchAzurePrices()
        this.pricingSource = result.pricingSource
        this.pricingLastUpdated = result.pricingLastUpdated
        this.pricingData = result.pricingData
      } finally {
        this.pricingLoading = false
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
      const sourceLabel = this.pricingSource === 'api'
        ? `Azure Retail Pricing API（${this.pricingLastUpdated} 更新）`
        : `內建快照（${this.pricingLastUpdated}）`

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
          lines.push(`預備金（${this.contingencyPct}%）：≈ ${this.fmt(c.reserve)} 萬`)
        }
        lines.push(`一年期總費：${this.fmt(c.totalLow)}–${this.fmt(c.totalHigh)} 萬`)
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

      if (this.answers.q8 === 'b') {
        lines.push('', '【AI 費用】')
        const src = this.overrides.aiMonthlyQueries != null ? '手動設定' : 'Q1/Q2 推算'
        lines.push(`月查詢量：${this.effectiveAiMonthlyQueries.toLocaleString('zh-TW')} 次（${src}）`)
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
    tier(newTier, oldTier) {
      if (newTier !== oldTier && this.allAnswered) {
        this.serviceInstances  = {}
        this.serviceSelections = {}
        this.expandedBundles   = {}
        this.autoSelectBundles()
      }
    },
    answers: {
      deep: true,
      handler() {
        if (this.allAnswered) this.autoSelectBundles()
      },
    },
  },

  async mounted() {
    await loadPricing()
    const status = getPricingStatus()
    this.pricingSource = status.pricingSource
    this.pricingLastUpdated = status.pricingLastUpdated
    this.pricingData = status.pricingData
  },
}).mount('#app')
