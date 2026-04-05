const REMOTE_CONFIG_URL =
  'https://api-zone-3okzyt9oie1u-1300801728.eo-edgefunctions.com/api/config'

const DEFAULT_ENV = {
  useMockLLM: false,
  requestTimeout: 120000,
  cloudflare: {
    forced: false,
    apiUrl: '',
    models: [],
    thinking: 'disabled',
  },
  features: {
    menuUploadMaxCount: 1,
    exchangeRateReferenceEnabled: false,
  },
  volcengine: {
    forced: false,
    baseUrl: '',
    model: '',
    apiKey: '',
    thinking: 'disabled',
  },
}

const env = cloneValue(DEFAULT_ENV)

let ready = false
let lastError = null
let loadPromise = null

applyEnv(DEFAULT_ENV)

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }

  if (value && typeof value === 'object') {
    const result = {}
    Object.keys(value).forEach((key) => {
      result[key] = cloneValue(value[key])
    })
    return result
  }

  return value
}

function mergeDeep(base, override) {
  const result = cloneValue(base)
  const source = override && typeof override === 'object' ? override : {}

  Object.keys(source).forEach((key) => {
    const nextValue = source[key]

    if (Array.isArray(nextValue)) {
      result[key] = nextValue.slice()
      return
    }

    if (nextValue && typeof nextValue === 'object') {
      result[key] = mergeDeep(base && base[key], nextValue)
      return
    }

    if (typeof nextValue !== 'undefined') {
      result[key] = nextValue
    }
  })

  return result
}

function applyEnv(nextConfig) {
  const merged = mergeDeep(DEFAULT_ENV, nextConfig)

  env.useMockLLM = Boolean(merged.useMockLLM)
  env.requestTimeout = Number(merged.requestTimeout) || DEFAULT_ENV.requestTimeout
  env.cloudflare = mergeDeep(DEFAULT_ENV.cloudflare, merged.cloudflare)
  env.features = mergeDeep(DEFAULT_ENV.features, merged.features)
  env.volcengine = mergeDeep(DEFAULT_ENV.volcengine, merged.volcengine)

  return env
}

function normalizeResponse(data) {
  console.log("remote config:", data)
  if (!data || typeof data !== 'object') {
    throw new Error('配置接口返回格式异常')
  }

  if (data.code !== 0) {
    throw new Error(data.message || '配置接口返回异常')
  }

  if (!data.data || typeof data.data !== 'object') {
    throw new Error('配置接口缺少有效数据')
  }

  return data.data
}

function fetchRemoteConfig() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: REMOTE_CONFIG_URL,
      method: 'GET',
      timeout: DEFAULT_ENV.requestTimeout,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`配置加载失败: ${res.statusCode}`))
          return
        }

        try {
          resolve(normalizeResponse(res.data))
        } catch (error) {
          reject(error)
        }
      },
      fail: () => {
        reject(new Error('配置加载失败，请检查网络或域名白名单'))
      },
    })
  })
}

function initialize(forceRefresh) {
  if (ready && !forceRefresh) {
    return Promise.resolve(env)
  }

  if (loadPromise && !forceRefresh) {
    return loadPromise
  }

  loadPromise = fetchRemoteConfig()
    .then((remoteConfig) => {
      applyEnv(remoteConfig)
      ready = true
      lastError = null
      return env
    })
    .catch((error) => {
      ready = false
      lastError = error
      throw error
    })
    .finally(() => {
      loadPromise = null
    })

  return loadPromise
}

function isReady() {
  return ready
}

function getLastError() {
  return lastError
}

env.initialize = initialize
env.isReady = isReady
env.getLastError = getLastError
env.REMOTE_CONFIG_URL = REMOTE_CONFIG_URL
env.DEFAULT_ENV = cloneValue(DEFAULT_ENV)

module.exports = env
