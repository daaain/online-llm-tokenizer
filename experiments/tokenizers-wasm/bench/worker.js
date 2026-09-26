import initWasm, { Tokenizer } from './pkg-web/tk_wasm.js'
let tokenizer
self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    const a = performance.now()
    await initWasm({ module_or_path: data.module })
    const json = await (await fetch(`/models/${data.model}/tokenizer.json`)).text()
    tokenizer = new Tokenizer(json)
    self.postMessage({ type: 'loaded', ms: performance.now() - a })
  } else if (data.type === 'tokenize') {
    const a = performance.now()
    const ids = tokenizer.encode(data.text, true)
    const strs = tokenizer.decodeEach(ids)
    self.postMessage({ type: 'tokenized', ms: performance.now() - a, ntok: ids.length })
  }
}
