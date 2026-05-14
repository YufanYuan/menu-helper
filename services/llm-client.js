const env = require('../config/env')
const settingsStore = require('../store/settings-store')
const { parseStructuredPayload, safeJsonParse } = require('../utils/json')

const DIRECT_VOLC_COUNTRIES = {
  CN: true,
  RU: true,
}

const OPENROUTER_REASONING_EFFORTS = {
  none: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
}

const OPENROUTER_REASONING_ALIASES = {
  disabled: 'none',
  off: 'none',
  false: 'none',
}

const VOLC_THINKING_TYPES = {
  disabled: true,
  enabled: true,
  auto: true,
}

const VOLC_THINKING_ALIASES = {
  none: 'disabled',
  off: 'disabled',
  false: 'disabled',
  on: 'enabled',
  true: 'enabled',
}

function loginWithWeChat() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('微信登录失败，未获取到 code'))
          return
        }

        resolve(res.code)
      },
      fail: () => {
        reject(new Error('微信登录失败，请稍后重试'))
      },
    })
  })
}

function normalizeCountry(value) {
  if (typeof value !== 'string') {
    return 'INTL'
  }

  const code = value.trim().toUpperCase()
  return DIRECT_VOLC_COUNTRIES[code] ? code : 'INTL'
}

function getForcedProvider() {
  const cloudflareForced = Boolean(env.cloudflare && env.cloudflare.forced)
  const volcengineForced = Boolean(env.volcengine && env.volcengine.forced)

  if (cloudflareForced === volcengineForced) {
    return ''
  }

  return volcengineForced ? 'volcengine' : 'cloudflare'
}

function shouldUseVolcEngine() {
  const forcedProvider = getForcedProvider()

  if (forcedProvider) {
    return forcedProvider === 'volcengine'
  }

  return DIRECT_VOLC_COUNTRIES[normalizeCountry(settingsStore.getState().clientCountry)]
}

function getPreferredProvider() {
  return shouldUseVolcEngine() ? 'volcengine' : 'cloudflare'
}

function requestStructuredChatCompletion({
  messages,
  schema,
  schemaName,
  volcInput,
  clientRequestId,
  sessionId,
}) {
  if (!env.isReady()) {
    return Promise.reject(new Error('配置尚未加载完成，请稍后重试'))
  }

  if (shouldUseVolcEngine()) {
    return requestVolcEngineStructuredChatCompletion({
      messages,
      schema,
      schemaName,
      input: volcInput,
      clientRequestId,
      sessionId,
    })
  }

  return requestOpenRouterStructuredChatCompletion({
    messages,
    schema,
    schemaName,
    clientRequestId,
    sessionId,
  })
}

function requestOpenRouterStructuredChatCompletion({
  messages,
  schema,
  schemaName,
  clientRequestId,
  sessionId,
}) {
  const config = env.cloudflare || {}
  const hasModels = Array.isArray(config.models) && config.models.length > 0

  if (!config.apiUrl || (!config.model && !hasModels)) {
    return Promise.reject(new Error('Cloudflare API 配置不完整，请检查 config/env.js'))
  }

  return loginWithWeChat().then(
    (wechatCode) =>
      new Promise((resolve, reject) => {
        const data = {
          wechat_code: wechatCode,
          messages,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: schemaName,
              schema,
              strict: true,
            },
          },
          provider: {
            require_parameters: true,
          },
          structured_outputs: true,
          client_request_id: clientRequestId,
          session_id: sessionId,
        }

        if (hasModels) {
          data.models = config.models
        } else {
          data.model = config.model
        }

        if (typeof config.temperature === 'number') {
          data.temperature = config.temperature
        }

        if (typeof config.maxTokens === 'number') {
          data.max_tokens = config.maxTokens
        }

        const reasoning = buildOpenRouterReasoning(config)
        if (reasoning) {
          data.reasoning = reasoning
        }

        wx.request({
          url: config.apiUrl,
          method: 'POST',
          timeout: env.requestTimeout,
          header: {
            'Content-Type': 'application/json',
          },
          data,
          success: (res) => {
            const body = res.data || {}

            if (res.statusCode < 200 || res.statusCode >= 300 || body.success === false) {
              const message =
                (body.error && body.error.message) ||
                body.message ||
                `LLM 请求失败: ${res.statusCode}`
              reject(new Error(message))
              return
            }

            const content = extractChatCompletionText(body.data)

            if (!content) {
              reject(new Error('LLM 返回为空'))
              return
            }

            try {
              resolve(parseStructuredPayload(content))
            } catch (error) {
              reject(error)
            }
          },
          fail: () => {
            reject(new Error('请求 Cloudflare API 失败，请检查网络或域名白名单'))
          },
        })
      }),
  )
}

function requestVolcEngineStructuredChatCompletion({
  messages,
  schema,
  schemaName,
  input,
  clientRequestId,
  sessionId,
}) {
  const config = env.volcengine || {}

  if (!config.apiKey || !config.baseUrl || !config.model) {
    return Promise.reject(new Error('火山引擎配置不完整，请检查 config/env.js'))
  }

  const normalizedInput = Array.isArray(input) && input.length ? input : toVolcInput(buildVolcMessages(messages))
  const thinking = buildVolcThinking(config)
  const payload = {
    model: config.model,
    input: normalizedInput,
    thinking,
    text: {
      format: buildJsonSchemaFormat(schema, schemaName),
    },
  }

  if (!payload.input.length) {
    return Promise.reject(new Error('火山引擎请求缺少有效输入'))
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/responses`,
      method: 'POST',
      timeout: env.requestTimeout,
      header: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      data: payload,
      success: (res) => {
        const body = normalizeResponseBody(res.data)

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message =
            (body.error && body.error.message) ||
            body.message ||
            `火山引擎请求失败: ${res.statusCode}`
          reject(new Error(message))
          return
        }

        const content = extractVolcResponseText(body)

        if (!content) {
          reject(new Error('火山引擎返回为空'))
          return
        }

        try {
          resolve(parseStructuredPayload(content))
        } catch (error) {
          reject(error)
        }
      },
      fail: () => {
        reject(new Error('请求火山引擎失败，请检查网络、域名白名单或密钥配置'))
      },
    })
  })
}

function buildVolcMessages(messages) {
  return Array.isArray(messages) ? messages : []
}

function buildJsonSchemaFormat(schema, schemaName) {
  return {
    type: 'json_schema',
    name: schemaName || 'response',
    schema,
    strict: true,
  }
}

function normalizeThinkingLabel(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().toLowerCase()
}

function pickThinkingLabel(thinking) {
  if (!thinking || typeof thinking !== 'object' || Array.isArray(thinking)) {
    return normalizeThinkingLabel(thinking)
  }

  return (
    normalizeThinkingLabel(thinking.type) ||
    normalizeThinkingLabel(thinking.effort) ||
    normalizeThinkingLabel(thinking.level) ||
    normalizeThinkingLabel(thinking.mode)
  )
}

function buildOpenRouterReasoning(config) {
  if (config.reasoning && typeof config.reasoning === 'object' && !Array.isArray(config.reasoning)) {
    return config.reasoning
  }

  const thinking = config.thinking

  if (thinking && typeof thinking === 'object' && !Array.isArray(thinking)) {
    if (thinking.reasoning && typeof thinking.reasoning === 'object' && !Array.isArray(thinking.reasoning)) {
      return thinking.reasoning
    }

    const reasoning = {}
    const effort = normalizeOpenRouterEffort(pickThinkingLabel(thinking))
    const maxTokens =
      typeof thinking.max_tokens === 'number'
        ? thinking.max_tokens
        : thinking.maxTokens

    if (typeof maxTokens === 'number' && maxTokens > 0) {
      reasoning.max_tokens = maxTokens
    } else if (effort) {
      reasoning.effort = effort
    } else if (shouldEnableOpenRouterReasoning(pickThinkingLabel(thinking))) {
      reasoning.enabled = true
    } else if (typeof thinking.enabled === 'boolean') {
      reasoning.enabled = thinking.enabled
    }

    if (typeof thinking.exclude === 'boolean') {
      reasoning.exclude = thinking.exclude
    }

    return Object.keys(reasoning).length ? reasoning : null
  }

  const effort = normalizeOpenRouterEffort(pickThinkingLabel(thinking))
  if (effort) {
    return { effort }
  }

  const label = pickThinkingLabel(thinking)
  if (shouldEnableOpenRouterReasoning(label)) {
    return { enabled: true }
  }

  return null
}

function normalizeOpenRouterEffort(value) {
  const label = normalizeThinkingLabel(value)
  const effort = OPENROUTER_REASONING_ALIASES[label] || label
  return OPENROUTER_REASONING_EFFORTS[effort] ? effort : ''
}

function shouldEnableOpenRouterReasoning(value) {
  const label = normalizeThinkingLabel(value)
  return label === 'enabled' || label === 'auto' || label === 'on' || label === 'true'
}

function buildVolcThinking(config) {
  const thinking = config.thinking
  const label = pickThinkingLabel(thinking)
  const type = VOLC_THINKING_ALIASES[label] || label

  if (VOLC_THINKING_TYPES[type]) {
    return { type }
  }

  return { type: 'disabled' }
}

function toVolcInput(messages) {
  if (!Array.isArray(messages)) {
    return []
  }

  const mapped = []

  messages.forEach((message) => {
    if (!message || typeof message !== 'object') {
      return
    }

    const role = typeof message.role === 'string' ? message.role : 'user'
    const content = message.content

    if (typeof content === 'string') {
      mapped.push({
        role,
        content: [{ type: 'input_text', text: content }],
      })
      return
    }

    if (content && typeof content === 'object' && !Array.isArray(content)) {
      mapped.push({
        role,
        content: [{ type: 'input_text', text: JSON.stringify(content) }],
      })
      return
    }

    if (!Array.isArray(content)) {
      return
    }

    const mappedContent = []

    content.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return
      }

      if (item.type === 'text' && typeof item.text === 'string') {
        mappedContent.push({
          type: 'input_text',
          text: item.text,
        })
        return
      }

      if (item.type !== 'image_url') {
        return
      }

      if (typeof item.image_url === 'string') {
        mappedContent.push({
          type: 'input_image',
          image_url: item.image_url,
        })
        return
      }

      if (item.image_url && typeof item.image_url.url === 'string') {
        mappedContent.push({
          type: 'input_image',
          image_url: item.image_url.url,
        })
      }
    })

    if (mappedContent.length > 0) {
      mapped.push({
        role,
        content: mappedContent,
      })
    }
  })

  return mapped
}

function normalizeResponseBody(body) {
  if (body && typeof body === 'object') {
    return body
  }

  if (typeof body === 'string') {
    return safeJsonParse(body, {}) || {}
  }

  return {}
}

function extractVolcResponseText(response) {
  if (!response || typeof response !== 'object') {
    return ''
  }

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim()
  }

  if (Array.isArray(response.output)) {
    const text = response.output
      .map((item) => {
        if (!item || !Array.isArray(item.content)) {
          return ''
        }

        return item.content
          .map((contentItem) => {
            if (contentItem && contentItem.type === 'output_text' && typeof contentItem.text === 'string') {
              return contentItem.text
            }
            return ''
          })
          .join('')
      })
      .join('')
      .trim()

    if (text) {
      return text
    }
  }

  return extractChatCompletionText(response)
}

function extractChatCompletionText(response) {
  if (!response) {
    return ''
  }

  const message =
    response.choices &&
    response.choices[0] &&
    response.choices[0].message

  if (!message) {
    return ''
  }

  if (message.parsed && typeof message.parsed === 'object') {
    return JSON.stringify(message.parsed)
  }

  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim()
  }

  if (message.content && typeof message.content === 'object' && !Array.isArray(message.content)) {
    return JSON.stringify(message.content)
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item.text === 'string') {
          return item.text
        }
        if (item.parsed && typeof item.parsed === 'object') {
          return JSON.stringify(item.parsed)
        }
        return ''
      })
      .join('')
      .trim()
  }

  return ''
}

module.exports = {
  requestStructuredChatCompletion,
  getPreferredProvider,
}
