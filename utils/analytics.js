const sessionStore = require('../store/session-store')
const settingsStore = require('../store/settings-store')

function getAppVersion() {
  if (!wx.getAccountInfoSync) {
    return 'unknown'
  }

  try {
    const info = wx.getAccountInfoSync()
    return (
      (info && info.miniProgram && info.miniProgram.version) ||
      (info && info.miniProgram && info.miniProgram.envVersion) ||
      'unknown'
    )
  } catch (error) {
    return 'unknown'
  }
}

function buildCommonPayload(pageName) {
  const session = sessionStore.getState()
  const settings = settingsStore.getState()

  return sanitizePayload({
    page_name: pageName || '',
    session_id: session.sessionId || '',
    recognition_status: session.recognitionStatus || '',
    user_language: settings.userLanguage || '',
    order_display_mode: settings.orderDisplayMode || '',
    client_country: settings.clientCountry || '',
    app_version: getAppVersion(),
    platform: 'miniapp',
  })
}

function sanitizeValue(value) {
  if (value === null || typeof value === 'undefined') {
    return undefined
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'string') {
    return value.slice(0, 256)
  }

  if (Array.isArray(value)) {
    return value.join(',').slice(0, 256)
  }

  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 256)
  }

  return String(value).slice(0, 256)
}

function sanitizePayload(payload) {
  const result = {}

  Object.keys(payload || {}).forEach((key) => {
    const safeValue = sanitizeValue(payload[key])
    if (typeof safeValue !== 'undefined') {
      result[key] = safeValue
    }
  })

  return result
}

function trackEvent(eventId, payload, pageName) {
  if (!eventId) {
    return
  }

  const finalPayload = sanitizePayload(Object.assign({}, buildCommonPayload(pageName), payload))

  try {
    if (wx.reportEvent) {
      wx.reportEvent(eventId, finalPayload)
    } else {
      console.info('[analytics]', eventId, finalPayload)
    }
  } catch (error) {
    console.warn('[analytics] report failed', eventId, error)
  }
}

function createClientRequestId(prefix) {
  const head = typeof prefix === 'string' && prefix ? prefix : 'req'
  return `${head}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
}

module.exports = {
  trackEvent,
  createClientRequestId,
}
