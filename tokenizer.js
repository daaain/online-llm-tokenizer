// from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.3'
import { AutoTokenizer } from './transformers.js'

// Constants
const KEY_MODELS = 'models'
const DEBOUNCE_DELAY = 300 // ms
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
window.removeModel = function (modelName) {
  if (models.length <= 1) {
    alert('Cannot remove the last model')
    return false
  }

  if (confirm(`Are you sure you want to remove "${modelName}"?`)) {
    models = models.filter((m) => m !== modelName)
    saveModels()

    // Remove from loaded models and UI
    delete loadedModels[modelName]
    const modelElement = document.querySelector(`li[data-model="${modelName}"]`)
    if (modelElement) {
      modelElement.remove()
    }
    return true
  }
  return false
}

loadModels()

const loadedModels = {}
const modelsList = document.getElementById('models')

const textInput = document.getElementById('textInput')

// Load text from URL parameters if available
const urlParams = new URLSearchParams(window.location.search)
const urlText = urlParams.get('text')
if (urlText) {
  textInput.value = decodeURIComponent(urlText)
}

// Need to add 2 pixels to account for the borders
textInput.setAttribute('style', `height:${textInput.scrollHeight + 2}px;`)
let textInputContent = textInput.value

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
  textInput.style.height = 0
  textInput.style.height = `${textInput.scrollHeight + 2}px`
  textInputContent = event.target.value
  debouncedUpdateTokens()
})

/**
 * Create model list item with loading indicator
 */
function createModelListItem(modelName) {
  const listItem = document.createElement('li')
  listItem.dataset.model = modelName
  listItem.innerHTML = `
    <div class="model-header">
      <h2>${modelName} ⏳</h2>
      <button class="delete-btn" onclick="removeModel('${modelName}')">🗑️ Delete</button>
    </div>
    <p style="color: #666; font-style: italic;">Loading tokenizer...</p>
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

  // Load all models in parallel
  const loadPromises = models
    .filter((model) => !(model in loadedModels))
    .map((model) => loadSingleTokenizer(model))

  await Promise.all(loadPromises)
  console.log('All models loaded')
}

const renderTokenAndText = (acc, { token, text }, index) => {
  return (acc +=
    text === '\n'
      ? '<br>'
      : `<ruby><rb style="background: #${COLOURS[index % COLOURS.length]}66">${text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</rb><rt class="token">${token}</rt></ruby>`)
}

/**
 * Update display for a single model
 */
function updateSingleModel(modelName) {
  const model = loadedModels[modelName]
  if (!model) return

  let modelBlockWithTextAndTokens = ''
  if (model.error) {
    modelBlockWithTextAndTokens = `
      <div class="model-header">
        <h2>${modelName} ❌</h2>
        <button class="delete-btn" onclick="removeModel('${modelName}')">🗑️ Delete</button>
      </div>
      <p style='white-space: pre-line; color: red; font-family: monospace; font-size: 0.9em; padding: 1em; background: rgba(255,0,0,0.1); border-radius: 4px;'>
        Failed to load model. This could mean:
        • Model doesn't exist on HuggingFace
        • Missing required tokenizer files
        • Licence agreement required
        • Network connectivity issue

Error: ${model.error}
      </p>`
  } else {
    const tokens = model.encode(textInputContent)
    const textFromTokens = model
      .batch_decode(
        tokens.map((token) => [token]),
        { clean_up_tokenization_spaces: true }
      )
      .map((text, index) => ({ text, token: tokens[index] }))
      .reduce(renderTokenAndText, '')

    modelBlockWithTextAndTokens = `
      <div class="model-header">
        <h2>${modelName} <img src="favicons/token.svg" alt="Token"> Token count: ${tokens.length}</h2>
        <button class="delete-btn" onclick="removeModel('${modelName}')">🗑️ Delete</button>
      </div>
      ${textFromTokens}
    `
  }
  const modelElement = document.querySelector(`li[data-model="${modelName}"]`)
  if (modelElement) {
    modelElement.innerHTML = modelBlockWithTextAndTokens
  }
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

await loadTokenizers()

const addModelBox = document.getElementById('addModel')
const addModelInput = addModelBox.querySelector('input')
const addModelButton = addModelBox.querySelector('button')

addModelButton.addEventListener('click', async () => {
  const modelName = addModelInput.value
  if (addModel(modelName)) {
    addModelInput.value = ''
    loadModels()
    await loadTokenizers()
    window.scrollTo(0, document.body.scrollHeight)
  }
})

// Allow Enter key to add model
addModelInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    addModelButton.click()
  }
})

// Share functionality
const shareBtn = document.getElementById('shareBtn')
shareBtn.addEventListener('click', () => {
  const currentUrl = new URL(window.location.href)
  currentUrl.searchParams.set('text', encodeURIComponent(textInputContent))
  currentUrl.searchParams.set('models', models.join(','))

  navigator.clipboard
    .writeText(currentUrl.toString())
    .then(() => {
      const originalText = shareBtn.textContent
      shareBtn.textContent = '✅ Copied!'
      shareBtn.style.background = '#28a745'

      setTimeout(() => {
        shareBtn.textContent = originalText
        shareBtn.style.background = '#0066cc'
      }, 2000)
    })
    .catch((err) => {
      console.error('Failed to copy URL:', err)
      // Fallback: select the URL text
      const textArea = document.createElement('textarea')
      textArea.value = currentUrl.toString()
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)

      const originalText = shareBtn.textContent
      shareBtn.textContent = '✅ Copied!'
      shareBtn.style.background = '#28a745'

      setTimeout(() => {
        shareBtn.textContent = originalText
        shareBtn.style.background = '#0066cc'
      }, 2000)
    })
})
