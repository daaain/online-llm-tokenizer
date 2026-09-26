// Compares the wasm binding built from daaain/tokenizers@claude/wasm-integration with transformers.js:
// token ids and per-token text for the 14 models in fetch-models.sh. Build it into pkg-integration/ with
// wasm-bindgen --target nodejs --out-dir pkg-integration <path to tokenizers_wasm.wasm>
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import { AutoTokenizer, env } from '@huggingface/transformers'
const { Tokenizer } = require('./pkg-integration/tokenizers_wasm.js')

env.localModelPath = './models/'
env.allowRemoteModels = false
const MODELS = ['Qwen/Qwen3-Next-80B-A3B-Instruct','deepseek-ai/DeepSeek-V3.1-Terminus','openai/gpt-oss-120b','HuggingFaceTB/SmolLM3-3B','Xenova/gemma2-tokenizer','Xenova/claude-tokenizer','TinyLlama/TinyLlama-1.1B-Chat-v1.0','microsoft/Phi-3-mini-4k-instruct','Xenova/gpt-4o','zai-org/GLM-4.5','Xenova/bert-base-uncased','Xenova/t5-small','Xenova/xlm-roberta-base','mistralai/Mistral-Nemo-Instruct-2407']
const text = fs.readFileSync('./text.txt', 'utf8')
const t = () => performance.now()
const f = (x) => x.toFixed(1).padStart(8)

// What the app will do before loading: drop any Strip decoder so each token keeps its whitespace
function withoutStrip(json) {
  const config = JSON.parse(json)
  const d = config.decoder
  if (d?.type === 'Strip') config.decoder = null
  else if (Array.isArray(d?.decoders)) d.decoders = d.decoders.filter((x) => x.type !== 'Strip')
  return JSON.stringify(config)
}

let failures = 0
console.log('model'.padEnd(38), 'load rs', ' enc rs', ' dec rs', '  ntok', 'ids==', 'text==')
for (const m of MODELS) {
  const tj = await AutoTokenizer.from_pretrained(m)
  if (tj?.decoder?.decoders?.at(-1)?.config?.type === 'Strip') tj.decoder.decoders.pop()
  const json = withoutStrip(fs.readFileSync(`./models/${m}/tokenizer.json`, 'utf8'))
  let a = t(); const rs = Tokenizer.from_json(json); const loadR = t() - a
  const opts = { addSpecialTokens: true, padding: false, truncation: false }
  rs.encode('warm', opts)
  const idsT = tj.encode(text)
  a = t(); const idsR = rs.encode(text, opts); const encR = t() - a
  const decT = tj.batch_decode(idsT.map((x) => [x]), { clean_up_tokenization_spaces: false })
  a = t(); const decR = rs.decode_each(Uint32Array.from(idsR)); const decRT = t() - a
  const idsEq = idsT.length === idsR.length && idsT.every((x, i) => x === idsR[i])
  const textEq = decT.length === decR.length && decT.every((x, i) => x === decR[i])
  if (!idsEq || !textEq) failures++
  console.log(m.padEnd(38), f(loadR), f(encR), f(decRT), String(idsR.length).padStart(6), idsEq, textEq)
  if (!idsEq) { const i = idsT.findIndex((x, i) => x !== idsR[i]); console.log('   id diff @', i, idsT.slice(i, i + 5), Array.from(idsR.slice(i, i + 5))) }
  if (!textEq) { const i = decT.findIndex((x, i) => x !== decR[i]); console.log('   text diff @', i, JSON.stringify(decT.slice(i, i + 4)), JSON.stringify(decR.slice(i, i + 4))) }
  rs.free()
}
console.log(failures ? `${failures} model(s) differ` : 'all models match')
