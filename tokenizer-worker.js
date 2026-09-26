// One worker per model: loads its tokenizer off the main thread, then tokenises on request
import initWasm, { Tokenizer } from './tokenizers_wasm.js'

// Same cache transformers.js used, so files it already downloaded are reused
const CACHE_NAME = 'transformers-cache'

let tokenizer = null

/**
 * Fetch a file from the Hub, going through the Cache API when it's available (it needs a secure context)
 */
async function fetchFromHub(modelName, file) {
  const url = `https://huggingface.co/${modelName}/resolve/main/${file}`
  const cache = self.caches ? await caches.open(CACHE_NAME).catch(() => null) : null
  const cached = await cache?.match(url)
  if (cached) return cached

  const response = await fetch(url).catch(() => {
    throw new Error(`Couldn't reach Hugging Face to download ${file}`)
  })
  if (response.ok) await cache?.put(url, response.clone()).catch(() => {})
  return response
}

function hubError(modelName, status) {
  // The Hub answers 401 both for gated repos and for ones that don't exist, so it can't tell them apart
  if (status === 401 || status === 403) {
    return `"${modelName}" doesn't exist, or it's gated and needs its licence accepted on Hugging Face (try a Xenova/ re-upload)`
  }
  if (status === 404) return `"${modelName}" has no tokenizer.json`
  return `Hugging Face answered ${status} for tokenizer.json`
}

/**
 * Some tokenizers strip spaces when decoding; drop that step so each token shows its whitespace
 */
function removeStripDecoder(config) {
  const decoder = config.decoder
  if (decoder?.type === 'Strip') {
    config.decoder = null
  } else if (Array.isArray(decoder?.decoders)) {
    decoder.decoders = decoder.decoders.filter((step) => step.type !== 'Strip')
  }
}

/**
 * The model's own `clean_up_tokenization_spaces`, which transformers applies when decoding.
 * Defaults to true when unset, as in transformers; null when there's no readable config.
 */
async function loadCleanUpDefault(modelName) {
  try {
    const response = await fetchFromHub(modelName, 'tokenizer_config.json')
    if (!response.ok) return null
    return (await response.json()).clean_up_tokenization_spaces ?? true
  } catch {
    return null
  }
}

async function load({ modelName, module }) {
  await initWasm({ module_or_path: module })
  const [response, cleanUpDefault] = await Promise.all([
    fetchFromHub(modelName, 'tokenizer.json'),
    loadCleanUpDefault(modelName),
  ])
  if (!response.ok) throw new Error(hubError(modelName, response.status))

  const config = await response.json()
  removeStripDecoder(config)
  tokenizer = Tokenizer.from_json(JSON.stringify(config))
  return { cleanUpDefault }
}

function tokenize({ text }) {
  // Never pad or truncate: the UI wants every token of the whole text
  const ids = tokenizer.encode(text, { padding: false, truncation: false })
  const texts = tokenizer.decode_each(ids)
  return { ids, texts }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      self.postMessage({ type: 'loaded', ...(await load(data)) })
    } else if (data.type === 'tokenize') {
      const { ids, texts } = tokenize(data)
      self.postMessage({ type: 'tokenized', seq: data.seq, ids, texts }, [ids.buffer])
    }
  } catch (error) {
    self.postMessage({ type: 'error', seq: data.seq, message: error?.message ?? String(error) })
  }
}
