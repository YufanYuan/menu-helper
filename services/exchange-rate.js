const env = require('../config/env')
const { normalizeCurrencyCode } = require('../utils/currency')

const CACHE_KEY = 'menu_helper_exchange_rates'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const REQUEST_TIMEOUT = Math.min(env.requestTimeout || 15000, 15000)

async function getReferenceRate({ baseCurrency, quoteCurrency }) {
  const base = normalizeCurrencyCode(baseCurrency)
  const quote = normalizeCurrencyCode(quoteCurrency)

  if (!base || !quote) {
    throw new Error('币种信息不完整')
  }

  if (base === quote) {
    return {
      baseCurrency: base,
      quoteCurrency: quote,
      rate: 1,
      rateDate: '',
      source: '',
      fetchedAt: Date.now(),
    }
  }

  const cacheKey = `${base}_${quote}`
  const cached = loadCache()[cacheKey]
  if (isFresh(cached)) {
    return cached
  }

  let lastError = null
  const providers = [fetchFrankfurterRate, fetchExchangeRateApiRate]

  for (let index = 0; index < providers.length; index += 1) {
    try {
      const result = await providers[index]({
        baseCurrency: base,
        quoteCurrency: quote,
      })

      const payload = Object.assign({}, result, {
        baseCurrency: base,
        quoteCurrency: quote,
        fetchedAt: Date.now(),
      })

      saveCache(cacheKey, payload)
      return payload
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('参考汇率暂时不可用')
}

async function fetchFrankfurterRate({ baseCurrency, quoteCurrency }) {
  const url = `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(baseCurrency)}&quotes=${encodeURIComponent(quoteCurrency)}&providers=ECB`
  const data = await requestJson(url)
  const entry = Array.isArray(data)
    ? data.find((item) => item && item.base === baseCurrency && item.quote === quoteCurrency)
    : null

  if (!entry || !Number.isFinite(Number(entry.rate))) {
    throw new Error('Frankfurter 返回格式异常')
  }

  return {
    rate: Number(entry.rate),
    rateDate: entry.date || '',
    source: 'Frankfurter / ECB',
  }
}

async function fetchExchangeRateApiRate({ baseCurrency, quoteCurrency }) {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`
  const data = await requestJson(url)
  const rate = data && data.rates ? Number(data.rates[quoteCurrency]) : NaN

  if (data.result !== 'success' || !Number.isFinite(rate)) {
    throw new Error('ExchangeRate-API 返回格式异常')
  }

  return {
    rate,
    rateDate: extractDate(data.time_last_update_utc),
    source: 'ExchangeRate-API',
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: REQUEST_TIMEOUT,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`汇率请求失败: ${res.statusCode}`))
          return
        }

        resolve(res.data)
      },
      fail: reject,
    })
  })
}

function loadCache() {
  return wx.getStorageSync(CACHE_KEY) || {}
}

function saveCache(cacheKey, payload) {
  const cache = loadCache()
  cache[cacheKey] = payload
  wx.setStorageSync(CACHE_KEY, cache)
}

function isFresh(payload) {
  if (!payload || !payload.fetchedAt) {
    return false
  }

  return Date.now() - payload.fetchedAt < CACHE_TTL_MS
}

function extractDate(value) {
  const raw = String(value || '')
  const match = raw.match(/\d{1,2}\s[A-Za-z]{3}\s\d{4}/)
  return match ? match[0] : ''
}

module.exports = {
  getReferenceRate,
}
