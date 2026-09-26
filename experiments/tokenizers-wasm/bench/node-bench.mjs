import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'
import { AutoTokenizer, env } from '@huggingface/transformers'
const require = createRequire(import.meta.url)
const { Tokenizer } = require('./pkg-node/tk_wasm.js')

env.localModelPath = './models/'
env.allowRemoteModels = false
const MODELS = process.argv.length > 2 ? process.argv.slice(2) : ['Qwen/Qwen3-Next-80B-A3B-Instruct','deepseek-ai/DeepSeek-V3.1-Terminus','openai/gpt-oss-120b','HuggingFaceTB/SmolLM3-3B','Xenova/gemma2-tokenizer','Xenova/claude-tokenizer']
const text = fs.readFileSync('./text.txt', 'utf8')
const t = () => performance.now()
const f = (x) => x.toFixed(1).padStart(8)

console.log('model'.padEnd(36), 'load tjs', 'load rs', 'enc tjs', 'enc rs', 'dec tjs', 'dec rs', ' ntok', 'ids==', 'text==')
for (const m of MODELS) {
  let a = t(); const tj = await AutoTokenizer.from_pretrained(m); const loadT = t() - a
  if (tj?.decoder?.decoders?.at(-1)?.config?.type === 'Strip') tj.decoder.decoders.pop()
  const json = fs.readFileSync(`./models/${m}/tokenizer.json`, 'utf8')
  a = t(); const rs = new Tokenizer(json); const loadR = t() - a

  tj.encode('warm'); rs.encode('warm', true)
  a = t(); const idsT = tj.encode(text); const encT = t() - a
  a = t(); const idsR = rs.encode(text, true); const encR = t() - a
  a = t(); const decT = tj.batch_decode(idsT.map((x) => [x]), { clean_up_tokenization_spaces: false }); const decTT = t() - a
  a = t(); const decR = rs.decodeEach(Uint32Array.from(idsR)); const decRT = t() - a

  const idsEq = idsT.length === idsR.length && idsT.every((x, i) => x === idsR[i])
  let textEq = decT.length === decR.length && decT.every((x, i) => x === decR[i])
  console.log(m.padEnd(36), f(loadT), f(loadR), f(encT), f(encR), f(decTT), f(decRT), String(idsR.length).padStart(6), idsEq, textEq, idsEq ? '' : `tjs=${idsT.length}`)
  if (!textEq) {
    const i = decT.findIndex((x, i) => x !== decR[i])
    console.log('   first text diff @', i, JSON.stringify(decT.slice(i, i + 4)), 'vs', JSON.stringify(decR.slice(i, i + 4)))
  }
  if (!idsEq) {
    const i = idsT.findIndex((x, i) => x !== idsR[i])
    console.log('   first id diff @', i, idsT.slice(i, i + 5), 'vs', Array.from(idsR.slice(i, i + 5)))
  }
  rs.free()
}
