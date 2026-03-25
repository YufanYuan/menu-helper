const env = {
  useMockLLM: false,
  llmProvider: 'openrouter',
  requestTimeout: 120000,
  openrouter: {
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: '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',
    models: ['google/gemini-3-flash-preview','qwen/qwen3.5-plus-02-15','moonshotai/kimi-k2.5'],
    appUrl: 'https://github.com/yufan/menu-helper',
    appName: 'menu-helper',
  },
  ark: {
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    apiKey: '85097b8a-70d8-4b5e-aa9a-9f1032479e7a',
    model: 'doubao-seed-2-0-pro-260215',
  },
}

module.exports = env
