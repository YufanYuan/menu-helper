const env = {
  useMockLLM: false,
  requestTimeout: 120000,
  cloudflare: {
    apiUrl: 'https://menu-helper-openrouter-proxy.2012sft.workers.dev/api/chat/completions',
    models: ['google/gemini-3-flash-preview', 'qwen/qwen3.5-plus-02-15', 'moonshotai/kimi-k2.5']
  },
}

module.exports = env
