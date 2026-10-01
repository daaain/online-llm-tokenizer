/**
 * A stand-in for the Hugging Face Hub that holds back each model's tokenizer until the test releases it,
 * so a test chooses the order the cards fill in rather than leaving it to the network
 */

const CHARACTERS = ['\n', '\t', ...Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index))]

// A BPE without merges splits the text into single characters, so every model gets plenty of tokens without a
// real vocabulary (the WebAssembly build has no regex engine for a Split pre-tokenizer)
const TOKENIZER = {
  version: '1.0',
  truncation: null,
  padding: null,
  added_tokens: [],
  normalizer: null,
  pre_tokenizer: null,
  post_processor: null,
  decoder: null,
  model: {
    type: 'BPE',
    dropout: null,
    unk_token: '[UNK]',
    continuing_subword_prefix: null,
    end_of_word_suffix: null,
    fuse_unk: false,
    byte_fallback: false,
    ignore_merges: false,
    vocab: Object.fromEntries(['[UNK]', ...CHARACTERS].map((token, id) => [token, id])),
    merges: [],
  },
}

const HUB_FILE = /^https:\/\/huggingface\.co\/(?<model>[^/]+\/[^/]+)\/resolve\/main\/(?<file>.+)$/

export async function mockHub(context) {
  const gates = new Map()
  const gate = (model) => {
    if (!gates.has(model)) {
      let open
      gates.set(model, { opened: new Promise((resolve) => (open = resolve)), open })
    }
    return gates.get(model)
  }

  await context.route(HUB_FILE, async (route) => {
    const { model, file } = route.request().url().match(HUB_FILE).groups
    if (file === 'tokenizer_config.json') return route.fulfill({ json: { clean_up_tokenization_spaces: false } })
    await gate(model).opened
    await route.fulfill({ json: TOKENIZER })
  })

  return {
    release: (...models) => models.forEach((model) => gate(model).open()),
  }
}
