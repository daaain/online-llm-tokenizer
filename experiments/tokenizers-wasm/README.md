# tokenizers → WASM experiment

Can the Rust [huggingface/tokenizers](https://github.com/huggingface/tokenizers) replace transformers.js in this app, compiled to WebAssembly?

**Yes, it works.** Token ids and per-token text are identical to transformers.js 3.7.3 for 14 tokenizers (byte-level BPE, Metaspace BPE, WordPiece and Unigram). Tokenising is roughly 8× faster end to end. Loading a tokenizer is 1–2× slower.

## What's here

- `src/lib.rs`: a ~70 line `wasm-bindgen` wrapper exposing `new Tokenizer(json)`, `encode`, `decode` and `decodeEach`. It also removes the `Strip` decoder, which the app used to pop off in JS.
- `patches/`: two fixes needed to make upstream work (see below).
- `build.sh`: clones tokenizers at a pinned commit, applies the patches, then builds and binds.
- `bench/`: Node and Chromium (Playwright) benchmarks against transformers.js.

```sh
cargo install wasm-bindgen-cli
./build.sh
cd bench && ./fetch-models.sh && npm install
node node-bench.mjs                      # correctness + timings in Node
python3 -m http.server 8765 &            # then, for Chromium:
node run-bench.mjs <model,model,...> 1   # 1 = text repeat count
node run-workers.mjs <model,model,...>   # one Web Worker per model
```

## Findings

This is the unreleased `1.0.0-dev` rewrite, at `bbccb05`. It has its own SIMD pre-tokenizer with a wasm SIMD128 kernel. It only reads the new "canonical" `tokenizer.json`, so Hub files are upgraded with `tk_convert` first.

Two things had to be patched:

1. `ptr_hash` (a dependency) calls `std::time::Instant` while building its hash tables. That panics on `wasm32-unknown-unknown`, so the patch swaps in `web-time`.
2. tk-encode refuses to load a byte-fallback BPE unless all 256 `<0xNN>` tokens exist. Gemma 2 has a literal tab token instead of `<0x09>`, so it failed to load. The patch maps missing codes to `<unk>`. Upstream should probably take both fixes.

`getrandom` also needs its `wasm_js` backend, which is configured in `Cargo.toml` and `.cargo/config.toml`.

### Chromium, 6 default models, 40 KB text (this app's own source)

| | transformers.js | Rust WASM |
|---|---|---|
| encode + per-token decode, all 6 models | 529 ms | 63 ms |
| same, 400 KB text | 5304 ms | 647 ms |
| encode only, Qwen3-Next, 40 KB | 58 ms | 0.8 ms |
| load (parse + build), per model | 0.2–2.0 s | 0.3–2.2 s |
| WASM compile + instantiate | – | ~30 ms |
| download (gzip) | 219 KB | 695 KB |

- Most of the remaining Rust time is `decodeEach`, which creates one JS string per token. Returning a single string plus offsets should cut that further.
- The rc0 design pays at load time for fast encoding. It parses the JSON two or three times (legacy upgrade, then the canonical reader) and builds vocab and perfect-hash tables. Native Rust is only about 1.5× faster at loading than WASM, so this isn't a WASM penalty.
- Real-world loading is dominated by downloading 2–27 MB of `tokenizer.json` anyway.
- transformers.js applies `clean_up_tokenization_spaces` (`" ."` → `"."`). The Rust per-token decode shows the token's real text, which is arguably more correct for this app.

### Web Workers (4 cores)

One worker per model shares a single compiled `WebAssembly.Module`. All six default models then load in 5.1 s wall-clock, against ~8 s one after another on the main thread, and the page stays responsive throughout. Parallel tokenising of all six takes 55 ms.
