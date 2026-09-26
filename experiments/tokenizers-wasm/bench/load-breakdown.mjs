import fs from 'node:fs'
import { createRequire } from 'node:module'
const { Tokenizer, canonicalize } = createRequire(import.meta.url)('./pkg-node/tk_wasm.js')
const t = () => performance.now()
for (const m of ['Qwen/Qwen3-Next-80B-A3B-Instruct','deepseek-ai/DeepSeek-V3.1-Terminus','openai/gpt-oss-120b','HuggingFaceTB/SmolLM3-3B','Xenova/gemma2-tokenizer','Xenova/claude-tokenizer']) {
  const json = fs.readFileSync(`./models/${m}/tokenizer.json`, 'utf8')
  let a = t(); JSON.parse(json); const jp = t() - a
  a = t(); const c = canonicalize(json); const ct = t() - a
  a = t(); const tk = Tokenizer.fromCanonical(c); const ft = t() - a
  console.log(m.padEnd(36), `JSON.parse ${jp.toFixed(0)}ms  canonicalize ${ct.toFixed(0)}ms  from_json ${ft.toFixed(0)}ms  (${(json.length/1e6).toFixed(1)}MB -> ${(c.length/1e6).toFixed(1)}MB)`)
  tk.free()
}
