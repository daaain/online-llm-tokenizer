// from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.3'
import { AutoTokenizer } from './transformers.js'

// Constants
const KEY_MODELS = 'models'
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

/**
 * Load a single tokenizer
 */
async function loadSingleTokenizer(modelName) {
  try {
    console.log('Loading model:', modelName)
    const tokenizer = await AutoTokenizer.from_pretrained(modelName)

    // some tokenizers strip spaces, let's prevent it so we can render them with the token numbers
    if (tokenizer?.decoder?.decoders?.at(-1)?.config?.type === 'Strip') {
      tokenizer.decoder.decoders.pop()
    }

    loadedModels[modelName] = tokenizer
    console.log('Loaded model:', modelName)

    // Update this specific model's display
    updateSingleModel(modelName)
  } catch (error) {
    console.error('Model loading error:', error)
    const errorMessage = error.message || 'Unknown error loading model'
    loadedModels[modelName] = { error: errorMessage }

    // Update this specific model's display
    updateSingleModel(modelName)
  }
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

  // Load all models in parallel
  const loadPromises = models
    .filter((model) => !(model in loadedModels))
    .map((model) => loadSingleTokenizer(model))

  await Promise.all(loadPromises)
  console.log('All models loaded')
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
 * Update display for a single model
 */
function updateSingleModel(modelName) {
  const model = loadedModels[modelName]
  if (!model) return

  const modelElement = document.getElementById(modelElementId(modelName))
  if (!modelElement) return

  modelElement.classList.remove('loading')

  if (model.error) {
    tokenCounts[modelName] = null
    modelElement.innerHTML = `
      ${renderModelHeader(modelName)}
      <p class="model-error">Failed to load model. This could mean:
        • Model doesn't exist on HuggingFace
        • Missing required tokenizer files
        • Licence agreement required
        • Network connectivity issue

Error: ${escapeHtml(model.error)}</p>`
  } else {
    const tokens = model.encode(textInputContent)
    const textFromTokens = model
      .batch_decode(
        tokens.map((token) => [token]),
        { clean_up_tokenization_spaces: true }
      )
      .map((text, index) => renderTokenAndText({ text, token: tokens[index] }, index))
      .join('<wbr>')

    tokenCounts[modelName] = tokens.length
    modelElement.innerHTML = `
      ${renderModelHeader(
        modelName,
        `<div class="model-count"><strong>${tokens.length}</strong><span>tokens</span></div>`
      )}
      <div class="tokens">${textFromTokens}</div>
    `
  }
  renderCounts()
}

/**
 * Token count overview: each name links to its model card, bars are relative to the largest count
 */
function renderCounts() {
  const loadedCounts = models.map((m) => tokenCounts[m]).filter((count) => Number.isInteger(count))
  const maxCount = Math.max(1, ...loadedCounts)

  countsList.innerHTML = models
    .map((modelName) => {
      const { org, repo } = splitModelName(modelName)
      const name = `<span class="count-name"><span class="muted">${org}</span>${repo}</span>`
      const count = tokenCounts[modelName]

      if (Number.isInteger(count)) {
        const width = (count / maxCount) * 100
        return `
          <li><a href="#${modelElementId(modelName)}">
            ${name}
            <span class="count-bar"><span style="width: ${width}%"></span></span>
            <span class="count-value">${count}</span>
          </a></li>`
      }

      const failed = count === null
      return `
        <li><a href="#${modelElementId(modelName)}">
          ${name}
          <span class="count-bar pending"></span>
          <span class="count-status${failed ? ' error' : ''}">${failed ? 'failed' : 'loading'}</span>
        </a></li>`
    })
    .join('')
}

/**
 * Update tokens for all loaded models
 * TODO: Consider doing this in a worker for better performance
 */
function updateTokens() {
  for (const modelName of Object.keys(loadedModels)) {
    updateSingleModel(modelName)
  }
}

modelsList.addEventListener('click', (event) => {
  const removeButton = event.target.closest('.remove-btn')
  if (removeButton) {
    removeModel(removeButton.dataset.model)
  }
})

const addModelForm = document.getElementById('addModel')
const addModelInput = document.getElementById('addModelInput')

// Submitting the form also covers pressing Enter in the input
addModelForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const modelName = addModelInput.value
  if (addModel(modelName)) {
    addModelInput.value = ''
    loadModels()
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
