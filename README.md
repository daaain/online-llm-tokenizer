# Online LLM Tokenizer

A tokenizer running entirely in your browser that can load `tokenizer.json` and `tokenizer_config.json` from any repository on HuggingFace. You can use it to count tokens and compare how different large language model vocabularies work. It's also useful for debugging prompt templates.

## Features

- **No server required**: Client-side tokenization with Hugging Face's Rust [tokenizers](https://github.com/huggingface/tokenizers) compiled to WebAssembly
- **Compare models**: Load multiple tokenizers simultaneously to see how different models tokenize the same text
- **Visual token display**: Each token is displayed with its original text and token ID using colour-coded backgrounds
- **Share configurations**: Generate shareable URLs with your text and model selection
- **Persistent settings**: Model lists are saved in localStorage across browser sessions
- **HuggingFace integration**: Load any tokenizer directly from HuggingFace Hub
- **Dark mode support**: Automatic theme detection with appropriate colour schemes
- **Offline capability**: Once models are loaded, tokenization works completely offline

## Usage

### Adding Models

Copy model names from HuggingFace (e.g., from the title of model pages like "microsoft/Phi-3-mini-4k-instruct") and paste into the "Add from Hugging Face" field. Press Enter or click "Add tokenizer".

### Deleting Models

Click the bin button on any model card. You'll get a confirmation prompt and cannot delete the last model.

### Sharing Configurations

Click "Copy share link" to copy a URL containing your current text and model selection. Share this URL with others to let them see the same tokenization.

### URL Parameters

You can link directly to specific configurations using URL parameters:
```
?text=your%20text&models=model1,model2,model3
```

### Token Display

- Each word/subword piece shows the original text above and the token number below
- Different background colours help distinguish adjacent tokens (cycling through 10 colours)
- Newlines are preserved in the display, and tokens containing a line break show a ↵ symbol
- The token count overview compares models at a glance; click a model name to jump to its card
- Tokens show their exact text (`" ."` keeps its space). A per-model "Clean up spaces before punctuation" switch shows the text as the model's decoder would tidy it, next to that model's own default. It never changes the IDs or the count

## Implementation Details

- **Rust tokenizers in WebAssembly**: The same tokenization code as Hugging Face's Python and Rust libraries, built from the wasm binding in [huggingface/tokenizers#2450](https://github.com/huggingface/tokenizers/pull/2450)
- **Web Workers**: Each tokenizer loads and runs in its own worker, in parallel and off the main thread. The WebAssembly module is compiled once and shared
- **Progressive rendering**: Models appear and update individually as they finish loading, providing immediate feedback
- **Debounced input processing**: Text changes are debounced by 300ms to prevent excessive re-tokenization during typing
- **Ruby annotations**: Tokens are displayed using HTML `<ruby>` elements with text above and token numbers below
- **Space preservation**: Automatically detects and removes tokenizer space-stripping to accurately show whitespace tokens
- **Caching**: Tokenizer files are kept with the Cache API, so reloading doesn't download them again. Deleting a model stops its worker

## Development

The project consists of these files:

- `index.html` - Main HTML structure and UI
- `tokenizer.css` - Styling including dark mode support
- `tokenizer.js` - UI logic, and one worker per model
- `tokenizer-worker.js` - Fetches a model's tokenizer files and tokenizes in a Web Worker
- `tokenizers_wasm.js` and `tokenizers_wasm_bg.wasm` - The vendored tokenizers build

### Local Development

Serve the folder over HTTP (e.g. `python3 -m http.server`) and open `index.html`. Module workers and WebAssembly don't load from `file://`. No build step required.

### Dependencies

- [tokenizers](https://github.com/huggingface/tokenizers), compiled to WebAssembly and vendored. `scripts/tokenizers-wasm/build.sh` rebuilds it from a pinned commit of [daaain/tokenizers@claude/wasm-integration](https://github.com/daaain/tokenizers/tree/claude/wasm-integration): the upstream wasm binding (huggingface/tokenizers#2450) plus fixes still in review upstream. `scripts/tokenizers-wasm/parity.mjs` checks a build against transformers.js. Once the binding is released, this can switch to the published package

## Browser Compatibility

Works in all modern browsers that support:
- ES6 modules, including module Web Workers
- WebAssembly
- Async/await
- LocalStorage
- Clipboard API (for share functionality)

## Why So Many Xenova Models?

If you're wondering why there are so many models under Xenova, it's because they work for HuggingFace and re-upload just the tokenizers, so it's possible to load them without agreeing to model licences.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Licence

See [LICENCE](LICENCE) file for details.

## Live Demo

Try it at: [danieldemmel.me/tokenizer](https://www.danieldemmel.me/tokenizer.html)
