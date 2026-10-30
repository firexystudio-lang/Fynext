'use strict';

// All presets use the OpenAI Chat Completions wire format. Model IDs and
// provider-side tool support are controlled by each service.
const PROVIDERS = [
  ['openai', 'OpenAI', 'https://api.openai.com/v1'],
  ['openrouter', 'OpenRouter (80+ providers)', 'https://openrouter.ai/api/v1'],
  ['groq', 'Groq', 'https://api.groq.com/openai/v1'],
  ['together', 'Together AI', 'https://api.together.xyz/v1'],
  ['fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com'],
  ['mistral', 'Mistral AI', 'https://api.mistral.ai/v1'],
  ['xai', 'xAI / Grok', 'https://api.x.ai/v1'],
  ['perplexity', 'Perplexity', 'https://api.perplexity.ai'],
  ['cerebras', 'Cerebras', 'https://api.cerebras.ai/v1'],
  ['deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai'],
  ['nebius', 'Nebius', 'https://api.tokenfactory.nebius.com/v1'],
  ['novita', 'Novita AI', 'https://api.novita.ai/v3/openai'],
  ['nvidia', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1'],
  ['sambanova', 'SambaNova', 'https://api.sambanova.ai/v1'],
  ['hyperbolic', 'Hyperbolic', 'https://api.hyperbolic.xyz/v1'],
  ['siliconflow', 'SiliconFlow', 'https://api.siliconflow.com/v1'],
  ['qwen', 'Qwen / Alibaba Model Studio', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'],
  ['moonshot', 'Moonshot AI / Kimi', 'https://api.moonshot.ai/v1'],
  ['zhipu', 'Zhipu AI / GLM', 'https://open.bigmodel.cn/api/paas/v4'],
  ['minimax', 'MiniMax', 'https://api.minimax.io/v1'],
  ['gemini', 'Google Gemini (OpenAI compatibility)', 'https://generativelanguage.googleapis.com/v1beta/openai'],
  ['cohere', 'Cohere Compatibility API', 'https://api.cohere.ai/compatibility/v1'],
  ['huggingface', 'Hugging Face Inference Providers', 'https://router.huggingface.co/v1'],
  ['modelscope', 'ModelScope', 'https://api-inference.modelscope.cn/v1'],
  ['gmi', 'GMI Cloud', 'https://api.gmi-serving.com/v1'],
  ['aimlapi', 'AI/ML API', 'https://api.aimlapi.com/v1'],
  ['inference', 'Inference.net', 'https://api.inference.net/v1'],
  ['scaleway', 'Scaleway Generative APIs', 'https://api.scaleway.ai/v1'],
  ['ovhcloud', 'OVHcloud AI Endpoints', 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1'],
  ['vllm', 'vLLM server', 'http://127.0.0.1:8000/v1'],
  ['lmstudio', 'LM Studio', 'http://127.0.0.1:1234/v1'],
  ['llamacpp', 'llama.cpp server', 'http://127.0.0.1:8080/v1'],
  ['localai', 'LocalAI', 'http://127.0.0.1:8080/v1'],
  ['ollama', 'Ollama OpenAI-compatible endpoint', 'http://127.0.0.1:11434/v1'],
  ['litellm', 'LiteLLM Gateway', 'http://127.0.0.1:4000/v1'],
  ['jan', 'Jan', 'http://127.0.0.1:1337/v1']
].map(([id, name, baseUrl]) => Object.freeze({ id, name, baseUrl }));

module.exports = { PROVIDERS };
