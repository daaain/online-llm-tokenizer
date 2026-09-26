# Handoff: Rust tokenizers in the browser

The work splits into three sessions, each briefed below so it can start from nothing. The experiment they build on is in this folder (`experiments/tokenizers-wasm/` on branch `claude/nice-hypatia-aoa0hh` of `daaain/online-llm-tokenizer`). Read its `README.md` for the numbers. `build.sh` reproduces the build from scratch.

Suggested order: sessions 1 and 2 can run in parallel. Session 2 depends on session 1's fork until the fixes land upstream. Session 3 needs a usable build from session 2.

## Background (shared by all three)

- The upstream is [huggingface/tokenizers](https://github.com/huggingface/tokenizers), unreleased `1.0.0-dev` rewrite. Tested at `bbccb051` (2026-09-23).
  - The Rust crates live under `tokenizers/`:
    - `tk-encode`: runtime
    - `tk-serialize`: hand-rolled `tokenizer.json` reader (`from_json`)
    - `tk-convert`: upgrades the legacy Hub format to canonical (`canonicalize_str` / `canonicalize_value`)
    - `bitcannon`: SIMD pre-tokenizer, with a wasm SIMD128 kernel
  - It builds for `wasm32-unknown-unknown` with `RUSTFLAGS="-C target-feature=+simd128"`.
- Hub `tokenizer.json` files have to go through `tk_convert` before `tk_serialize::from_json`.
- The result matches transformers.js 3.7.3 exactly (token ids and per-token decoded text) for 14 tokenizers:
  - Qwen3-Next, DeepSeek-V3.1, gpt-oss, SmolLM3, gemma2, claude
  - TinyLlama, Phi-3, gpt-4o, GLM-4.5, Mistral-Nemo
  - bert-base-uncased (WordPiece), t5-small and xlm-roberta-base (Unigram)
- Performance in Chromium, with the 6 default models and a 40 KB text:
  - Encoding plus per-token decoding: 63 ms (529 ms with transformers.js).
  - Loading: 0.3–2.2 s per model, similar to or slower than transformers.js. Most of it is `from_json` building tables; native Rust is only about 1.5× faster.
  - The `.wasm` is 2.1 MB (695 KB gzipped).
  - One Web Worker per model, sharing one compiled `WebAssembly.Module`, loads all six in 5.1 s (≈8 s serially) on 4 cores.

---

## Session 1: fork `huggingface/tokenizers` for the upstreamable fixes

**Goal:** fork `huggingface/tokenizers`, fix the problems found in the experiment, each with a test, and open PRs (plus one to `ptr_hash`, which lives in another repo).

### 1a. Byte-fallback BPE refuses to load when a `<0xNN>` token is missing (tokenizers)

- **Where:** `tokenizers/tk-encode/src/models/bpe/serialization.rs`, in `PipelineBPE`'s constructor, around line 258. It builds `fallback_lookup: [u32; 256]` and returns `Error::ByteFallbackOutOfVocabulary(b)` if any of the 256 codes is absent.
- **Real-world breakage:** Gemma 2 (`Xenova/gemma2-tokenizer`, `byte_fallback: true`) has no `<0x09>`, because tab is a literal vocab token. The released tokenizers (0.2x), transformers.js and Python all load it fine.
- **What the released library did:** at encode time, per character, it looks up every byte's `<0xNN>`. It uses them if *all* are found; otherwise it falls through to `unk` (respecting `fuse_unk`), or emits nothing if there is no `unk`.
- **Suggested fix:** store a sentinel (e.g. `u32::MAX`) for missing codes instead of erroring. Then, in the byte-fallback path (`convert.rs`: `convert_chars`, the `Atoms::Chars` branch near line 327, and `SymbolSink::push_char_bytes`), fall back to the unk logic for the whole character if any of its bytes hits the sentinel.
  - The experiment's patch (`patches/tokenizers-byte-fallback.patch`) is a shortcut that maps missing codes straight to `<unk>`. It's fine for Gemma but not a faithful port.
- **Tests:**
  - `tk-encode/src/models/bpe/tests.rs` has `byte_fallback_with_missing_codes_errors`, which asserts today's behaviour. Replace it with tests that a partial table loads, and that a character needing a missing byte becomes `unk`.
  - Add a parity check against Gemma 2 if the repo's oracle tests (`tk-convert/tests/oracle.rs`, which compares to tokenizers 0.23.2) can take a Hub config.

### 1b. `ptr_hash` panics on `wasm32-unknown-unknown` (ptr_hash, not tokenizers)

- **Upstream:** <https://github.com/RagnarGrootKoerkamp/ptrhash>, crate `ptr_hash` 2.1.1, used by `tk-encode` for its vocab tables.
- **Problem:** `PtrHash::new` (`src/lib.rs`, ~lines 595–682) and `util::log_duration` call `std::time::Instant::now()` even when logging is off. On `wasm32-unknown-unknown` that panics with "time not implemented on this platform".
- **Fix options:**
  - Use `web_time::Instant` (what `patches/ptr_hash-web-time.patch` does).
  - Better, since the timings only feed `trace!` logs: only take timestamps when `log::log_enabled!(Trace)`, or gate them with `cfg(not(target_arch = "wasm32"))`. That adds no dependency.
- Its `rayon` use is fine on wasm: rayon-core falls back to the current thread when it can't spawn threads.
- Once released, tokenizers only needs a version bump.

### 1c. Optional: make wasm builds painless in tokenizers

- `getrandom` is pulled in twice, and both need the `wasm_js` backend on wasm32:
  - 0.3, via `ahash`'s default `runtime-rng`
  - 0.4, via `rand 0.10`, via `ptr_hash`
- Downstream currently needs `getrandom = { features = ["wasm_js"] }` plus `--cfg getrandom_backend="wasm_js"` in rustflags.
- Worth an issue or PR:
  - Either `ahash = { default-features = false, features = ["std"] }` (with fixed or compile-time seeds, if HashDoS resistance isn't needed for vocab maps),
  - or add a `wasm32-unknown-unknown` CI build (`cargo build -p tk-serialize --target wasm32-unknown-unknown`) plus a README note.
  - The README's hardware table already advertises wasm32 SIMD128, so a CI job that proves it builds and runs (e.g. `wasm-bindgen-test` in Node) would stop regressions like 1b.

**Done when:** PRs are open against both upstreams, each with tests, and a fork branch has all fixes combined, for session 2 to depend on in the meantime.

---

## Session 2: new repo `tokenizers-wasm` (library)

**Goal:** a small, reusable browser library around the Rust tokenizers. The app consumes it like it consumed transformers.js today: one vendored ES module plus a `.wasm`, or an npm package.

### Starting point

Copy `src/lib.rs`, `Cargo.toml`, `.cargo/config.toml`, `build.sh`, `examples/native.rs` and `bench/` from this folder.
- Replace the `vendor/` + `patches/` mechanism with a git dependency on session 1's fork branch. Swap it for the crates.io release when it exists.
- Note that `Cargo.toml` needs `crate-type = ["cdylib", "rlib"]`, the `getrandom` wasm_js deps, and the `[patch.crates-io]` for `ptr_hash` until 1b is released.

### Current wrapper API (`src/lib.rs`)

- `new Tokenizer(json)`:
  - parses with `serde_json`
  - removes any `Strip` decoder (the app wants each token's whitespace)
  - runs `tk_convert::canonicalize_value`, then `tk_serialize::from_json`
- `encode(text, addSpecialTokens) -> Uint32Array`, with padding and truncation forced `Off`.
- `decode(ids, skipSpecial)`.
- `decodeEach(ids) -> string[]`, one decode per id.

### Work items

1. **Faster per-token decode.** `decodeEach` dominates the per-keystroke cost (about 6 of every 7 ms). Return one concatenated string plus a `Uint32Array` of offsets, and let JS slice it. Measure with `bench/run-bench.mjs`.
2. **Make stripping configurable.** Make the `Strip` removal an option instead of hard-coded.
3. **Loading helper.** `fromPretrained(repo)` that fetches `https://huggingface.co/<repo>/resolve/main/tokenizer.json`, cached with the Cache API as transformers.js does. It should report "missing / gated / 404" errors clearly.
4. **Worker helper.**
   - A small module that compiles the `.wasm` once (`WebAssembly.compileStreaming`) and runs one worker per tokenizer, or a pool capped at `navigator.hardwareConcurrency`.
   - Load and tokenise go over `postMessage`.
   - Prototype: `bench/worker.js` and `bench/workers.html`.
5. **Load-time investigation (optional, maybe upstream).** Profile `from_json`: callgrind showed big shares in JSON parsing, `bucket_vocab_store` and `ptr_hash` construction. Options:
   - skip the pretty-print round trip in `canonicalize_str` (the wrapper already uses `to_string` rather than `to_string_pretty`)
   - have `tk_serialize` read a `serde_json::Value` directly
   - cache the canonical JSON in IndexedDB
6. **Size.** Try `opt-level = "s"/"z"` and `wasm-opt -O3/-Oz` (binaryen). Report the speed/size trade-off; currently 695 KB gzipped at `opt-level = 3`.
7. **Packaging.**
   - Build with `wasm-bindgen --target web` (or `wasm-pack build --target web`).
   - Publish or attach `tokenizers_wasm.js` + `tokenizers_wasm_bg.wasm` as release assets.
   - Include `.d.ts`.
8. **Parity tests in CI.**
   - Port `bench/node-bench.mjs` into a test that compares ids and `decodeEach` output with `@huggingface/transformers` (`clean_up_tokenization_spaces: false`) across the 14-model list in `bench/fetch-models.sh`.
   - Cache the downloaded tokenizers in CI.
   - Include one gated-or-missing model to test error paths.

### Gotchas already hit

- Builds need `rustup target add wasm32-unknown-unknown` and `wasm-bindgen-cli`, and the CLI version must equal the `wasm-bindgen` crate version in `Cargo.lock`.
- The Node build (`--target nodejs`) emits CommonJS, so don't put `"type": "module"` in a `package.json` next to it.
- The browser build of transformers.js has `env.allowLocalModels = false` by default. The benchmarks turn it on to read `/models/`.

**Done when:**
- The repo builds in CI.
- Parity tests pass for all 14 models.
- There's a tagged release with the JS, `.wasm` and `.d.ts`.
- The README has current benchmark numbers.

---

## Session 3: switch `online-llm-tokenizer` to the new library

**Goal:** replace transformers.js in this app with `tokenizers-wasm`, loaded in Web Workers.

1. **Vendor the release.** Vendor session 2's release files the same way `transformers.js` is vendored today (`tokenizer.js:1–2`), then delete `transformers.js` (873 KB).
2. **Rewrite `loadSingleTokenizer` / `updateSingleModel` against the worker helper.**
   - One worker per model, so loading happens in parallel and off the main thread. This also resolves the `TODO` on `updateTokens`.
   - Keep progressive rendering: each card updates when its worker answers.
   - Drop superseded results when the text changes mid-tokenise, e.g. with a sequence number per request.
3. **Remove the old workarounds.**
   - Remove the `Strip` decoder hack (the library does it).
   - The app already shows each token's real text (`" ."` rather than `"."`): `clean_up_tokenization_spaces` was switched off in favour of fidelity. Keep that behaviour and don't add any clean-up back.
4. **Update error text for load failures.** Rust errors differ from transformers.js errors.
5. **Update the copy.**
   - `index.html` meta description ("using Transformers.js")
   - the "How it works" and "Implementation details" lists
   - `README.md` ("Pure client-side tokenization using transformers.js", Dependencies, Implementation Details), saying it's now the Rust tokenizers compiled to WebAssembly
6. **Remove this experiment.** Delete `experiments/tokenizers-wasm/` from this repo once the new repo holds it.
7. **Verify in a browser.** Check the default models, a model added by name, a gated or missing model (error card), a share link, and a big paste (e.g. the page's own HTML ×10). Typing should stay smooth.
