const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '欧元' },
  { code: 'CNY', name: '人民币' },
  { code: 'JPY', name: '日元' },
  { code: 'KRW', name: '韩元' },
  { code: 'HKD', name: '港币' },
  { code: 'TWD', name: '新台币' },
  { code: 'GBP', name: '英镑' },
  { code: 'BGN', name: '保加利亚列弗' },
  { code: 'CAD', name: '加元' },
  { code: 'AUD', name: '澳元' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'SEK', name: '瑞典克朗' },
  { code: 'NOK', name: '挪威克朗' },
  { code: 'DKK', name: '丹麦克朗' },
  { code: 'PLN', name: '波兰兹罗提' },
  { code: 'CZK', name: '捷克克朗' },
  { code: 'HUF', name: '匈牙利福林' },
  { code: 'RON', name: '罗马尼亚列伊' },
  { code: 'TRY', name: '土耳其里拉' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'SAR', name: '沙特里亚尔' },
  { code: 'ILS', name: '以色列新谢克尔' },
  { code: 'INR', name: '印度卢比' },
  { code: 'THB', name: '泰铢' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'IDR', name: '印尼盾' },
  { code: 'PHP', name: '菲律宾比索' },
  { code: 'VND', name: '越南盾' },
  { code: 'MXN', name: '墨西哥比索' },
  { code: 'BRL', name: '巴西雷亚尔' },
  { code: 'ARS', name: '阿根廷比索' },
  { code: 'CLP', name: '智利比索' },
  { code: 'COP', name: '哥伦比亚比索' },
  { code: 'ZAR', name: '南非兰特' },
]

const REGION_TO_CURRENCY = {
  AE: 'AED',
  AR: 'ARS',
  AT: 'EUR',
  AU: 'AUD',
  BE: 'EUR',
  BG: 'BGN',
  BR: 'BRL',
  CA: 'CAD',
  CH: 'CHF',
  CL: 'CLP',
  CN: 'CNY',
  CO: 'COP',
  CY: 'EUR',
  CZ: 'CZK',
  DE: 'EUR',
  DK: 'DKK',
  EE: 'EUR',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  GR: 'EUR',
  HK: 'HKD',
  HU: 'HUF',
  ID: 'IDR',
  IE: 'EUR',
  IL: 'ILS',
  IN: 'INR',
  IT: 'EUR',
  JP: 'JPY',
  KR: 'KRW',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MT: 'EUR',
  MX: 'MXN',
  MY: 'MYR',
  NL: 'EUR',
  NO: 'NOK',
  NZ: 'NZD',
  PH: 'PHP',
  PL: 'PLN',
  PT: 'EUR',
  RO: 'RON',
  SA: 'SAR',
  SE: 'SEK',
  SG: 'SGD',
  SI: 'EUR',
  SK: 'EUR',
  TH: 'THB',
  TR: 'TRY',
  TW: 'TWD',
  US: 'USD',
  VN: 'VND',
  ZA: 'ZAR',
}

const LANGUAGE_TO_CURRENCY = {
  english: 'USD',
  en: 'USD',
  ja: 'JPY',
  ko: 'KRW',
  zh: 'CNY',
  中文: 'CNY',
  日本語: 'JPY',
  한국어: 'KRW',
}

const SYMBOL_TO_CURRENCY = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '￥': 'CNY',
  '₩': 'KRW',
  'HK$': 'HKD',
}

const DEFAULT_CURRENCY = 'USD'

function normalizeCurrencyCode(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }

  if (SYMBOL_TO_CURRENCY[raw]) {
    return SYMBOL_TO_CURRENCY[raw]
  }

  const upper = raw.toUpperCase()
  if (/^[A-Z]{3}$/.test(upper)) {
    return upper
  }

  return ''
}

function isSupportedCurrency(code) {
  const normalized = normalizeCurrencyCode(code)
  return SUPPORTED_CURRENCIES.some((item) => item.code === normalized)
}

function getCurrencyOptions(extraCurrency) {
  const normalizedExtra = normalizeCurrencyCode(extraCurrency)
  if (!normalizedExtra || isSupportedCurrency(normalizedExtra)) {
    return SUPPORTED_CURRENCIES.slice()
  }

  return [{ code: normalizedExtra, name: '菜单币种' }].concat(SUPPORTED_CURRENCIES)
}

function getCurrencyOptionLabels(extraCurrency) {
  return getCurrencyOptions(extraCurrency).map((item) => `${item.code} · ${item.name}`)
}

function findCurrencyIndex(code, options) {
  const normalized = normalizeCurrencyCode(code)
  const index = (options || []).findIndex((item) => item.code === normalized)
  return index >= 0 ? index : 0
}

function extractDeviceLocale() {
  try {
    if (typeof wx.getAppBaseInfo === 'function') {
      const baseInfo = wx.getAppBaseInfo()
      if (baseInfo && baseInfo.language) {
        return String(baseInfo.language)
      }
    }
  } catch (error) {}

  try {
    const info = wx.getSystemInfoSync()
    if (info && info.language) {
      return String(info.language)
    }
    if (info && info.locale) {
      return String(info.locale)
    }
  } catch (error) {}

  return ''
}

function inferCurrencyFromLocale(locale) {
  const region = extractRegionFromLocale(locale)
  return region ? REGION_TO_CURRENCY[region] || '' : ''
}

function inferCurrencyFromUserLanguage(userLanguage) {
  const key = String(userLanguage || '').trim().toLowerCase()
  return LANGUAGE_TO_CURRENCY[key] || ''
}

function resolveDefaultDisplayCurrency({ preferredCurrency, locale, userLanguage, menuCurrency }) {
  const candidates = [
    preferredCurrency,
    inferCurrencyFromLocale(locale),
    inferCurrencyFromUserLanguage(userLanguage),
    menuCurrency,
    DEFAULT_CURRENCY,
  ]

  for (let index = 0; index < candidates.length; index += 1) {
    const normalized = normalizeCurrencyCode(candidates[index])
    if (normalized) {
      return normalized
    }
  }

  return DEFAULT_CURRENCY
}

function formatCurrencyAmount(amount, currency) {
  const numericAmount = Number(amount)
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0
  const normalized = normalizeCurrencyCode(currency)

  if (!normalized) {
    return safeAmount.toFixed(2)
  }

  return `${normalized} ${safeAmount.toFixed(2)}`
}

function extractRegionFromLocale(locale) {
  const normalized = String(locale || '').trim().replace(/_/g, '-')
  if (!normalized) {
    return ''
  }

  const parts = normalized.split('-').filter(Boolean)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index].toUpperCase()
    if (/^[A-Z]{2}$/.test(part)) {
      return part
    }
  }

  return ''
}

module.exports = {
  findCurrencyIndex,
  extractDeviceLocale,
  formatCurrencyAmount,
  getCurrencyOptionLabels,
  getCurrencyOptions,
  inferCurrencyFromLocale,
  inferCurrencyFromUserLanguage,
  isSupportedCurrency,
  normalizeCurrencyCode,
  resolveDefaultDisplayCurrency,
}
