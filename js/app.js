// Vue 3 Options API
// 依賴全域變數：WEIGHTS、TIER_DEFAULTS、DEFAULT_MONTHLY_COST（config.js）
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
    id: 'q7', title: '⑦ AI 功能',
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
      answers: { q1: null, q2: null, q3: null, q4: null, q5: null, q6: null, q7: null },
      weights: JSON.parse(JSON.stringify(WEIGHTS)), // 可變副本，供使用者調整
      overrides: {
        buildPersonMonthLow: null, buildPersonMonthHigh: null,
        durationLow: null,         durationHigh: null,
        maintMonthLow: null,       maintMonthHigh: null,
        monthlyCostLow: null,      monthlyCostHigh: null,
      },
      showAdvanced: false,
      showWeights: false,
      pricingSource: 'snapshot',
      pricingLastUpdated: null,
      pricingLoading: false,
      copyStatus: '',
    }
  },

  computed: {
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
  },

  methods: {
    fmt(n) {
      return Math.round(n || 0)
    },

    resetWeights() {
      this.weights = JSON.parse(JSON.stringify(WEIGHTS))
    },

    async refreshPricing() {
      this.pricingLoading = true
      const result = await fetchAzurePrices()
      this.pricingSource = result.pricingSource
      this.pricingLastUpdated = result.pricingLastUpdated
      this.pricingLoading = false
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
        lines.push('雲端年費基準：500–3,000 萬（含 25% 緩衝）')
      } else {
        lines.push(`建置費：${this.fmt(c.buildLow)}–${this.fmt(c.buildHigh)} 萬（中位約 ${this.fmt(c.buildMid)} 萬）`)
        lines.push(`雲端年費：${c.cloudLow}–${c.cloudHigh} 萬（含緩衝）`)
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
          const pts = this.weights[q.id][choice]
          lines.push(`${q.title}：${opt ? opt.label : choice}（+${pts} 分）`)
        }
      }

      // 列出被覆蓋的微調值
      const tweaked = []
      if (this.overrides.durationLow != null)          tweaked.push(`期程低端：${this.overrides.durationLow} 月`)
      if (this.overrides.durationHigh != null)         tweaked.push(`期程高端：${this.overrides.durationHigh} 月`)
      if (this.overrides.buildPersonMonthLow != null)  tweaked.push(`建置人月低端：${this.overrides.buildPersonMonthLow}`)
      if (this.overrides.buildPersonMonthHigh != null) tweaked.push(`建置人月高端：${this.overrides.buildPersonMonthHigh}`)
      if (this.overrides.monthlyCostLow != null)       tweaked.push(`月薪基準低端：${this.overrides.monthlyCostLow} 萬`)
      if (this.overrides.monthlyCostHigh != null)      tweaked.push(`月薪基準高端：${this.overrides.monthlyCostHigh} 萬`)
      if (tweaked.length > 0) {
        lines.push('', '【進階微調（已覆蓋預設值）】')
        lines.push(...tweaked)
      }

      return lines.join('\n')
    },
  },

  async mounted() {
    await loadPricing()
    const status = getPricingStatus()
    this.pricingSource = status.pricingSource
    this.pricingLastUpdated = status.pricingLastUpdated
  },
}).mount('#app')
