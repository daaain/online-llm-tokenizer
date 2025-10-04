# Online LLM Tokenizer

A pure JavaScript tokenizer running in your browser that can load `tokenizer.json` and `tokenizer_config.json` from any repository on HuggingFace. You can use it to count tokens and compare how different large language model vocabularies work. It's also useful for debugging prompt templates.

## Features

- **No server required**: Pure client-side tokenization using [transformers.js](https://huggingface.co/docs/transformers.js)
- **Compare models**: Load multiple tokenizers simultaneously to see how different models tokenize the same text
- **Visual token display**: Each token is displayed with its original text and token ID using colour-coded backgrounds
- **Share configurations**: Generate shareable URLs with your text and model selection
- **Persistent settings**: Model lists are saved in localStorage across browser sessions
- **HuggingFace integration**: Load any tokenizer directly from HuggingFace Hub
- **Dark mode support**: Automatic theme detection with appropriate colour schemes
- **Offline capability**: Once models are loaded, tokenization works completely offline

## Usage

### Adding Models

Copy model names from HuggingFace (e.g., from the title of model pages like "microsoft/Phi-3-mini-4k-instruct") and paste into the input field. Press Enter or click "Add tokenizer from HuggingFace".

### Deleting Models

Click the red "🗑️ Delete" button next to any model. You'll get a confirmation prompt and cannot delete the last model.

### Sharing Configurations

Click the "📋 Share" button to copy a URL containing your current text and model selection. Share this URL with others to let them see the same tokenization.

### URL Parameters

You can link directly to specific configurations using URL parameters:
```
?text=your%20text&models=model1,model2,model3
```

### Token Display

- Each word/subword piece shows the original text above and the token number below
- Different background colours help distinguish adjacent tokens (cycling through 10 colours)
- Newlines are preserved in the display

## Implementation Details

- **Parallel model loading**: All tokenizers load simultaneously using `Promise.all()` instead of sequentially, to improve startup time
- **Progressive rendering**: Models appear and update individually as they finish loading, providing immediate feedback
- **Debounced input processing**: Text changes are debounced by 300ms to prevent excessive re-tokenization during typing
- **Ruby annotations**: Tokens are displayed using HTML `<ruby>` elements with text above and token numbers below
- **Space preservation**: Automatically detects and removes tokenizer space-stripping to accurately show whitespace tokens
- **Memory management**: Models are cached in memory and only loaded once, with cleanup on deletion

## Development

The project consists of three main files:

- `index.html` - Main HTML structure and UI
- `tokenizer.css` - Styling including dark mode support
- `tokenizer.js` - Core tokenization logic using transformers.js

### Local Development

Simply open `index.html` in a modern web browser. No build step required.

### Dependencies

- [transformers.js](https://huggingface.co/docs/transformers.js) - Loaded as an ES module for client-side tokenization

## Browser Compatibility

Works in all modern browsers that support:
- ES6 modules
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
