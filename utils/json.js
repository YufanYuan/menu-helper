function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function extractJsonObject(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('模型未返回文本结果')
  }

  const startIndex = rawText.indexOf('{')
  const endIndex = rawText.lastIndexOf('}')

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('模型结果中未找到 JSON')
  }

  return rawText.slice(startIndex, endIndex + 1)
}

function parseStructuredPayload(value) {
  if (!value) {
    throw new Error('模型未返回结构化结果')
  }

  if (typeof value === 'object') {
    return value
  }

  if (typeof value !== 'string') {
    throw new Error('模型结构化结果类型不支持')
  }

  const parsed = safeJsonParse(value, null)
  if (parsed) {
    return parsed
  }

  const extracted = extractJsonObject(value)
  const extractedParsed = safeJsonParse(extracted, null)
  if (extractedParsed) {
    return extractedParsed
  }

  throw new Error('模型 JSON 解析失败')
}

module.exports = {
  safeJsonParse,
  extractJsonObject,
  parseStructuredPayload,
}
