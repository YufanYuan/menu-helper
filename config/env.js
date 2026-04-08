const env = {
  useMockLLM: false,
  requestTimeout: 120000,
  cloudflare: {
    apiUrl: 'https://menu-helper-openrouter-proxy.2012sft.workers.dev/api/chat/completions',
    models: ['google/gemini-3-flash-preview', 'qwen/qwen3.5-plus-02-15', 'moonshotai/kimi-k2.5'],
  },
  volcengine: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-2-0-pro-260215',
    apiKey: '85097b8a-70d8-4b5e-aa9a-9f1032479e7a',
  },
}

module.exports = env
