'use strict';

const MODELS = [
  {
    id: 'gemma-4-e2b-it-q4_0',
    name: 'Gemma 4 E2B (Q4_0)',
    repository: 'ggml-org/gemma-4-E2B-it-GGUF',
    revision: '6938c58e698502037401a5f19f6905f2fb2f7dee',
    file: 'gemma-4-E2B-it-Q4_0.gguf',
    size: 2841481184,
    sha256: '8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/google/gemma-4-E2B-it',
    url: 'https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/6938c58e698502037401a5f19f6905f2fb2f7dee/gemma-4-E2B-it-Q4_0.gguf'
  },
  {
    id: 'qwen2.5-coder-1.5b-q4km',
    name: 'Qwen2.5 Coder 1.5B (Q4_K_M)',
    repository: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    revision: 'f86cb2c1fa58255f8052cc32aeede1b7482d4361',
    file: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    size: 1117320768,
    sha256: 'cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/blob/f86cb2c1fa58255f8052cc32aeede1b7482d4361/LICENSE',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'
  },
  {
    id: 'qwen2.5-coder-1.5b-q5km',
    name: 'Qwen2.5 Coder 1.5B (Q5_K_M)',
    repository: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    revision: 'f86cb2c1fa58255f8052cc32aeede1b7482d4361',
    file: 'qwen2.5-coder-1.5b-instruct-q5_k_m.gguf',
    size: 1285494336,
    sha256: 'f15d02e8e51a5c6f9448b972819acfa66aee4d8bb7d881a8b8ba3d90da08ef09',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/blob/f86cb2c1fa58255f8052cc32aeede1b7482d4361/LICENSE',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q5_k_m.gguf'
  }
];

const DEFAULT_MODEL_ID = MODELS[0].id;

function getModel(id) {
  return MODELS.find((model) => model.id === id) || null;
}

module.exports = { MODELS, DEFAULT_MODEL_ID, getModel };
