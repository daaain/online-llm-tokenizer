// Constants
const KEY_MODELS = 'models'
const KEY_CLEAN_UP = 'cleanUp'
const DEBOUNCE_DELAY = 300 // ms
const COPIED_RESET_DELAY = 2000 // ms
const SKELETON_WIDTHS = [72, 120, 48, 96, 140, 64]
const COLOURS = [
  'E40303',
  'FF8C00',
  'FFED00',
  '008026',
  '061393',
  '732982',
  '5BCEFA',
  'F5A9B8',
  '8F3F2B',
  'FFFFFF',
]
const DEFAULT_MODELS = [
  'Qwen/Qwen3-Next-80B-A3B-Instruct',
  'deepseek-ai/DeepSeek-V3.1-Terminus',
  'openai/gpt-oss-120b',
  'HuggingFaceTB/SmolLM3-3B',
  'Xenova/gemma2-tokenizer',
  'Xenova/claude-tokenizer',
]
const ICON_TRASH =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>'

let models = []
let debounceTimer = null
let cleanUp = {}

/**
 * Load models from URL parameters or localStorage
 */
function loadModels() {
  const urlParams = new URLSearchParams(window.location.search)
  const urlModels = urlParams.get('models')

  if (urlModels) {
    models = urlModels
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0)
    saveModels()
    return
  }

  const storedModels = localStorage.getItem(KEY_MODELS)
  try {
    if (storedModels === null) throw Error('No models found in LocalStorage, using default list.')
    models = JSON.parse(storedModels)
  } catch (error) {
    console.log(error)
    models = [...DEFAULT_MODELS]
    saveModels()
  }
}

function saveModels() {
  localStorage.setItem(KEY_MODELS, JSON.stringify(models))

  // A shared link's model list stays in step with the page, so reloading doesn't undo adding or removing a model
  const url = new URL(window.location.href)
  if (url.searchParams.has('models') && url.searchParams.get('models') !== models.join(',')) {
    url.searchParams.set('models', models.join(','))
    history.replaceState(history.state, '', url)
  }
}

/**
 * Which models show their text with clean-up applied, remembered per model
 */
function loadCleanUp() {
  try {
    cleanUp = JSON.parse(localStorage.getItem(KEY_CLEAN_UP)) ?? {}
  } catch {
    cleanUp = {}
  }
}

function saveCleanUp() {
  try {
    localStorage.setItem(KEY_CLEAN_UP, JSON.stringify(cleanUp))
  } catch (error) {
    console.warn("Couldn't remember the clean-up setting:", error)
  }
}

/**
 * Validate HuggingFace model name format
 */
function isValidModelName(name) {
  if (!name || typeof name !== 'string') return false

  const trimmedName = name.trim()
  if (trimmedName.length === 0) return false

  // Basic validation: should contain at least one slash and valid characters
  const validPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
  return validPattern.test(trimmedName)
}

/**
 * Add a new model to the list
 */
function addModel(name) {
  const trimmedName = name.trim()

  if (!isValidModelName(trimmedName)) {
    alert(
      'Please enter a valid HuggingFace model name (e.g., "Xenova/gpt-4o" or "zai-org/GLM-4.5")'
    )
    return false
  }

  if (models.includes(trimmedName)) {
    alert('This model is already in the list')
    return false
  }

  models.push(trimmedName)
  saveModels()
  return true
}

/**
 * Remove a model from the list
 */
function removeModel(modelName) {
  if (models.length <= 1) {
    alert('Cannot remove the last model')
    return false
  }

  if (confirm(`Are you sure you want to remove "${modelName}"?`)) {
    models = models.filter((m) => m !== modelName)
    saveModels()

    // Remove from loaded models and UI
    loadedModels[modelName]?.worker.terminate()
    delete loadedModels[modelName]
    delete tokenCounts[modelName]
    document.getElementById(modelElementId(modelName))?.remove()
    renderCounts()
    return true
  }
  return false
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Model names are validated to [a-zA-Z0-9._-]/[a-zA-Z0-9._-], so this is a stable, valid id
 */
const modelElementId = (modelName) => `model-${modelName.replace('/', '--')}`

/**
 * Split "org/repo" so the org can be shown more quietly than the repo
 */
function splitModelName(modelName) {
  const slashIndex = modelName.indexOf('/')
  return {
    org: escapeHtml(modelName.slice(0, slashIndex + 1)),
    repo: escapeHtml(modelName.slice(slashIndex + 1)),
  }
}

loadModels()
loadCleanUp()

const loadedModels = {}
const tokenCounts = {}
const modelsList = document.getElementById('models')
const countsList = document.getElementById('counts')
const charCount = document.getElementById('charCount')

const textInput = document.getElementById('textInput')

// Load text from URL parameters if available
const urlParams = new URLSearchParams(window.location.search)
const urlText = urlParams.get('text')
if (urlText) {
  textInput.value = decodeURIComponent(urlText)
}

let textInputContent = textInput.value

function resizeTextInput() {
  // Collapsing to measure forces a layout of every card, which is slow with a long text
  if (CSS.supports('field-sizing', 'content')) return
  textInput.style.height = 0
  textInput.style.height = `${textInput.scrollHeight}px`
}

function updateCharCount() {
  const length = textInputContent.length
  charCount.textContent = `${length} character${length === 1 ? '' : 's'}`
}

resizeTextInput()
updateCharCount()

/**
 * Debounce function to limit how often updateTokens is called
 */
function debounce(func, delay) {
  return function (...args) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => func.apply(this, args), delay)
  }
}

const debouncedUpdateTokens = debounce(updateTokens, DEBOUNCE_DELAY)

textInput.addEventListener('input', (event) => {
  resizeTextInput()
  textInputContent = event.target.value
  updateCharCount()
  debouncedUpdateTokens()
})

function renderModelHeader(modelName, meta = '') {
  const { org, repo } = splitModelName(modelName)
  return `
    <div class="model-header">
      <div class="model-name">
        <span class="model-org">${org}</span>
        <h2>${repo}</h2>
      </div>
      <div class="model-meta">
        ${meta}
        <button type="button" class="icon-btn remove-btn" data-model="${escapeHtml(modelName)}"
          aria-label="Remove ${escapeHtml(modelName)}">${ICON_TRASH}</button>
      </div>
    </div>`
}

/**
 * Create model list item with loading indicator
 */
function createModelListItem(modelName) {
  const listItem = document.createElement('li')
  listItem.id = modelElementId(modelName)
  listItem.className = 'card model-card loading'
  listItem.innerHTML = `
    ${renderModelHeader(modelName)}
    <div class="skeleton" aria-hidden="true">
      ${SKELETON_WIDTHS.map((width) => `<span style="width: ${width}px"></span>`).join('')}
    </div>
    <span class="muted">Fetching tokenizer.json…</span>
  `
  return listItem
}

// Compiled once and shared by every worker, so each only has to instantiate it
const wasmModule = compileWasm()

async function compileWasm() {
  const url = new URL('tokenizers_wasm_bg.wasm', import.meta.url)
  try {
    return await WebAssembly.compileStreaming(fetch(url))
  } catch {
    // compileStreaming needs the server to send application/wasm
    return WebAssembly.compile(await (await fetch(url)).arrayBuffer())
  }
}

/**
 * Load a single tokenizer in its own worker, so loading and tokenising stay off the main thread
 */
async function loadSingleTokenizer(modelName) {
  const worker = new Worker(new URL('tokenizer-worker.js', import.meta.url), { type: 'module' })
  // `seq` numbers tokenise requests, so a reply for text that has since changed can be dropped
  const model = { worker, ready: false, error: null, cleanUpDefault: null, seq: 0, pending: false, result: null }
  loadedModels[modelName] = model

  worker.onmessage = ({ data }) => {
    if (loadedModels[modelName] !== model) return
    if (data.type === 'loaded') {
      console.log('Loaded model:', modelName)
      model.ready = true
      model.cleanUpDefault = data.cleanUpDefault
      requestTokens(modelName)
    } else if (data.type === 'tokenized') {
      if (data.seq !== model.seq) return
      model.pending = false
      model.error = null
      model.result = { ids: data.ids, texts: data.texts }
      updateSingleModel(modelName)
    } else if (data.type === 'error') {
      if (data.seq !== undefined && data.seq !== model.seq) return
      console.error('Model error:', modelName, data.message)
      model.pending = false
      model.error = data.message
      updateSingleModel(modelName)
    }
  }
  worker.onerror = (event) => {
    model.pending = false
    model.error = event.message || 'The tokenizer worker failed to start'
    updateSingleModel(modelName)
  }

  console.log('Loading model:', modelName)
  try {
    worker.postMessage({ type: 'load', modelName, module: await wasmModule })
  } catch (error) {
    model.error = `Couldn't load the WebAssembly tokenizer: ${error.message}`
    updateSingleModel(modelName)
  }
}

/**
 * Ask a loaded model's worker to tokenise the current text
 */
function requestTokens(modelName) {
  const model = loadedModels[modelName]
  if (!model?.ready) return
  model.seq += 1
  model.pending = true
  model.worker.postMessage({ type: 'tokenize', seq: model.seq, text: textInputContent })
}

/**
 * Load all tokenizers in parallel
 */
async function loadTokenizers() {
  console.log('Loading models...')

  // Create list items immediately for all models
  for (const model of models) {
    if (!(model in loadedModels)) {
      const listItem = createModelListItem(model)
      modelsList.appendChild(listItem)
    }
  }
  renderCounts()

  // Load all models in parallel, each in its own worker
  await Promise.all(
    models.filter((model) => !(model in loadedModels)).map((model) => loadSingleTokenizer(model))
  )
}

/**
 * A token's text sits above its ID; line breaks inside a token are shown as ↵ and then broken
 */
const renderTokenAndText = ({ token, text }, index) => {
  const colour = COLOURS[index % COLOURS.length]
  const lineBreaks = '<br>'.repeat((text.match(/\n/g) || []).length)
  return `<ruby style="--c: #${colour}"><span>${escapeHtml(text.replace(/\n/g, '↵'))}</span><rt>${token}</rt></ruby>${lineBreaks}`
}

/**
 * transformers' `clean_up_tokenization`: removes the space before punctuation and English contractions
 */
const cleanUpTokenization = (text) =>
  text
    .replaceAll(' .', '.')
    .replaceAll(' ?', '?')
    .replaceAll(' !', '!')
    .replaceAll(' ,', ',')
    .replaceAll(" ' ", "'")
    .replaceAll(" n't", "n't")
    .replaceAll(" 'm", "'m")
    .replaceAll(" 's", "'s")
    .replaceAll(" 've", "'ve")
    .replaceAll(" 're", "'re")

function renderCleanUpToggle(modelName, cleanUpDefault) {
  const checked = cleanUp[modelName] ? 'checked' : ''
  const modelDefault =
    cleanUpDefault === null ? 'no tokenizer_config.json' : `model default: ${cleanUpDefault ? 'on' : 'off'}`
  return `
    <label class="clean-up-toggle">
      <input type="checkbox" data-model="${escapeHtml(modelName)}" ${checked}>
      Clean up spaces before punctuation
      <span class="muted">(${modelDefault})</span>
    </label>`
}

/**
 * Update display for a single model
 */
function updateSingleModel(modelName) {
  const model = loadedModels[modelName]
  if (!model || !(model.error || model.result)) return

  const modelElement = document.getElementById(modelElementId(modelName))
  if (!modelElement) return

  modelElement.classList.remove('loading')

  if (model.error) {
    tokenCounts[modelName] = null
    modelElement.innerHTML = `
      ${renderModelHeader(modelName)}
      <p class="model-error">${model.ready ? 'Failed to tokenise' : 'Failed to load the tokenizer'}: ${escapeHtml(model.error)}</p>`
  } else {
    const { ids: tokens, texts } = model.result
    // Each token is shown exactly as it is, e.g. " ." rather than ".", unless clean-up is on
    const textFromTokens = texts
      .map((text, index) =>
        renderTokenAndText(
          { text: cleanUp[modelName] ? cleanUpTokenization(text) : text, token: tokens[index] },
          index
        )
      )
      .join('<wbr>')

    tokenCounts[modelName] = tokens.length
    const tokensElement = modelElement.querySelector('.tokens')
    if (tokensElement) {
      // Swap just the tokens and the count. Re-creating the clean-up checkbox made password managers
      // (e.g. KeePassXC-Browser) check whether it's visible, forcing a layout of every token on each update
      modelElement.querySelector('.model-count strong').textContent = tokens.length
      tokensElement.outerHTML = `<div class="tokens">${textFromTokens}</div>`
      renderCounts()
      return
    }
    modelElement.innerHTML = `
      ${renderModelHeader(
        modelName,
        `<div class="model-count"><strong>${tokens.length}</strong><span>tokens</span></div>`
      )}
      <div class="tokens">${textFromTokens}</div>
      ${renderCleanUpToggle(modelName, model.cleanUpDefault)}
    `
  }
  renderCounts()
}

function renderCountRow(modelName) {
  const { org, repo } = splitModelName(modelName)
  return `
    <li data-model="${escapeHtml(modelName)}"><a href="#${modelElementId(modelName)}">
      <span class="count-name"><span class="muted">${org}</span>${repo}</span>
      <span class="count-bar"><span></span></span>
      <span></span>
    </a></li>`
}

/**
 * Token count overview: each name links to its model card, bars are relative to the largest count.
 * Rows are updated in place, so bars ease to their new length and a processing animation isn't restarted
 */
function renderCounts() {
  const loadedCounts = models.map((m) => tokenCounts[m]).filter((count) => Number.isInteger(count))
  const maxCount = Math.max(1, ...loadedCounts)

  const rows = countsList.children
  if (rows.length !== models.length || models.some((modelName, index) => rows[index].dataset.model !== modelName)) {
    countsList.innerHTML = models.map(renderCountRow).join('')
  }

  models.forEach((modelName, index) => {
    const row = rows[index]
    const [, bar, value] = row.firstElementChild.children
    const count = tokenCounts[modelName]
    const hasCount = Number.isInteger(count)
    const processing = Boolean(loadedModels[modelName]?.pending)

    row.classList.toggle('processing', processing)
    if (processing !== row.hasAttribute('aria-busy')) {
      if (processing) row.setAttribute('aria-busy', 'true')
      else row.removeAttribute('aria-busy')
    }
    bar.classList.toggle('pending', !hasCount)
    const width = hasCount ? `${(count / maxCount) * 100}%` : '0%'
    if (bar.firstElementChild.style.width !== width) bar.firstElementChild.style.width = width

    const failed = count === null
    const valueClass = hasCount ? 'count-value' : `count-status${failed ? ' error' : ''}`
    const valueText = hasCount ? String(count) : failed ? 'failed' : 'loading'
    if (value.className !== valueClass) value.className = valueClass
    if (value.textContent !== valueText) value.textContent = valueText
  })
}

/**
 * Re-tokenise the current text in every loaded model's worker
 */
function updateTokens() {
  for (const modelName of Object.keys(loadedModels)) {
    requestTokens(modelName)
  }
  renderCounts()
}

modelsList.addEventListener('click', (event) => {
  const removeButton = event.target.closest('.remove-btn')
  if (removeButton) {
    removeModel(removeButton.dataset.model)
  }
})

modelsList.addEventListener('change', (event) => {
  const toggle = event.target.closest('.clean-up-toggle input')
  if (!toggle) return
  const modelName = toggle.dataset.model
  if (toggle.checked) cleanUp[modelName] = true
  else delete cleanUp[modelName]
  saveCleanUp()
  updateSingleModel(modelName)
})

const addModelForm = document.getElementById('addModel')
const addModelInput = document.getElementById('addModelInput')

// Submitting the form also covers pressing Enter in the input
addModelForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const modelName = addModelInput.value
  if (addModel(modelName)) {
    addModelInput.value = ''
    await loadTokenizers()
    document.getElementById(modelElementId(modelName.trim()))?.scrollIntoView()
  }
})

// Share functionality
const shareBtn = document.getElementById('shareBtn')
const shareBtnLabel = shareBtn.querySelector('.btn-label')

function showCopied() {
  const originalLabel = shareBtnLabel.textContent
  shareBtnLabel.textContent = 'Copied!'
  shareBtn.classList.add('copied')

  setTimeout(() => {
    shareBtnLabel.textContent = originalLabel
    shareBtn.classList.remove('copied')
  }, COPIED_RESET_DELAY)
}

shareBtn.addEventListener('click', () => {
  const currentUrl = new URL(window.location.href)
  currentUrl.hash = ''
  currentUrl.searchParams.set('text', encodeURIComponent(textInputContent))
  currentUrl.searchParams.set('models', models.join(','))

  navigator.clipboard
    .writeText(currentUrl.toString())
    .then(showCopied)
    .catch((err) => {
      console.error('Failed to copy URL:', err)
      // Fallback: select the URL text
      const textArea = document.createElement('textarea')
      textArea.value = currentUrl.toString()
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      showCopied()
    })
})

await loadTokenizers()
