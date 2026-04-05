const env = require('../config/env')
const { parseStructuredPayload } = require('../utils/json')

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

function requestStructuredChatCompletion({ messages, schema, schemaName }) {
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
}
