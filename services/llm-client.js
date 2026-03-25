const env = require('../config/env')
const { parseStructuredPayload } = require('../utils/json')

function requestOpenRouterStructuredChatCompletion({ messages, schema, schemaName }) {
  const config = env.openrouter || {}
  return new Promise((resolve, reject) => {
    if (!config.apiUrl || !config.apiKey || !config.models) {
      reject(new Error('OpenRouter 配置不完整，请检查 config/env.js'))
      return
    }

    const data = {
      models: config.models || [],
      messages,
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

    wx.request({
      url: config.apiUrl,
      method: 'POST',
      timeout: env.requestTimeout,
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': config.appUrl,
        'X-Title': config.appName,
      },
      data,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 400) {
          const message =
            (res.data && res.data.error && res.data.error.message) ||
            (res.data && res.data.message) ||
            `LLM 请求失败: ${res.statusCode}`
          reject(new Error(message))
          return
        }

        const content = extractChatCompletionText(res.data)

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
      fail: reject,
    })
  })
}

function requestArkStructuredResponse({ input, schema, schemaName }) {
  const config = env.ark || {}
  return new Promise((resolve, reject) => {
    if (!config.apiUrl || !config.apiKey || !config.model) {
      reject(new Error('Ark 配置不完整，请检查 config/env.js'))
      return
    }

    const data = {
      model: config.model,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema,
          strict: true,
        },
      },
    }

    wx.request({
      url: config.apiUrl,
      method: 'POST',
      timeout: env.requestTimeout,
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      data,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message =
            (res.data && res.data.error && res.data.error.message) ||
            (res.data && res.data.message) ||
            `LLM 请求失败: ${res.statusCode}`
          reject(new Error(message))
          return
        }

        const content = extractArkResponseText(res.data)

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
      fail: reject,
    })
  })
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

function extractArkResponseText(response) {
  if (!response) {
    return ''
  }

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim()
  }

  if (Array.isArray(response.output)) {
    const text = response.output
      .flatMap((item) => item.content || [])
      .map((item) => {
        if (typeof item.text === 'string') {
          return item.text
        }
        if (typeof item.arguments === 'string') {
          return item.arguments
        }
        return ''
      })
      .join('')
      .trim()

    if (text) {
      return text
    }
  }

  if (typeof response.text === 'string' && response.text.trim()) {
    return response.text.trim()
  }

  return ''
}

module.exports = {
  requestOpenRouterStructuredChatCompletion,
  requestArkStructuredResponse,
}
