# tokenizers → WebAssembly

The app's `tokenizers_wasm.js` and `tokenizers_wasm_bg.wasm` are built from Hugging Face's Rust [tokenizers](https://github.com/huggingface/tokenizers).

`build.sh` builds them from a pinned commit of [daaain/tokenizers@claude/wasm-integration](https://github.com/daaain/tokenizers/tree/claude/wasm-integration). That branch is:

- the wasm binding from [huggingface/tokenizers#2450](https://github.com/huggingface/tokenizers/pull/2450), still a draft
- merged with our byte-fallback fix, so Gemma 2 loads (PR open upstream, from `daaain/tokenizers@claude/eloquent-rubin-6u1o9u`)
- using our `ptr_hash` fix, so it doesn't panic reading the clock on wasm (PR open on [PtrHash](https://github.com/RagnarGrootKoerkamp/PtrHash), from `daaain/PtrHash@claude/eloquent-rubin-6u1o9u`)
- plus `+simd128` and a `decode_each` method, both proposed on #2450

Once these land and the binding is released on npm as `tokenizers-web`, vendor that instead and delete this folder.

## Rebuilding

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128   # must equal the wasm-bindgen crate in Cargo.lock
./build.sh                                         # writes the two files to the repo root
```

To move to a newer commit, update `REV` in `build.sh`. If the binding's API changed, update `tokenizer-worker.js` (`Tokenizer.from_json`, `encode`, `decode_each`).

## Checking parity with transformers.js

```sh
wasm-bindgen --target nodejs --out-dir pkg-node tokenizers/bindings/wasm/target/wasm32-unknown-unknown/release/tokenizers_wasm.wasm
./fetch-models.sh && npm install && node parity.mjs
```

It compares token ids and per-token text (with `clean_up_tokenization_spaces: false`) for 14 tokenizers covering byte-level BPE, Metaspace BPE, WordPiece and Unigram. At `d06c124` all 14 match transformers.js 3.7.3.

## Findings worth keeping

- Tokenising is about 8× faster than transformers.js end to end. Loading a tokenizer is similar or slower (0.1–3 s), mostly `from_json` building tables; native Rust is only about 1.5× faster there, so it isn't a wasm penalty.
- `+simd128` made no measurable encode difference in Node across six models.
- Per-token decoding (`decode_each`, one JS string per token) is most of the remaining per-keystroke cost. One string plus UTF-16 offsets would be faster; propose it upstream with numbers.
- Other ideas to measure before proposing: load-time profiling of `from_json`, and size (`opt-level`, `wasm-opt`). The build is 1.3 MB, 458 KB gzipped.
