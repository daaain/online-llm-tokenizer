# Handoff: Rust tokenizers in the browser

The experiment is in this folder: read `README.md` for the numbers, and `build.sh` reproduces the build. The plan changed after it: the library work goes upstream instead of into a new `tokenizers-wasm` repo, because [huggingface/tokenizers#2450](https://github.com/huggingface/tokenizers/pull/2450) (draft, by SBrandeis) already adds `bindings/wasm` with the same approach and aims to publish it on npm as `tokenizers-web`.

## Background

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

## Where things stand

Fork: `daaain/tokenizers`, with two branches:

- `claude/eloquent-rubin-6u1o9u`, off upstream `main`. Upstreamable fixes only, one PR each.
  - Byte-fallback fix (was 1a): a BPE vocab missing some `<0xNN>` codes now loads, and a character needing a missing code becomes `unk`, as in 0.x. Gemma 2 matches 0.23.2 across the whole oracle test. PR opened upstream.
- `claude/wasm-integration`: #2450 merged with the branch above, plus `+simd128` and a `decode_each` method. This is what the app consumes until everything is released. Never open a PR from it.
  - `ptr_hash` comes from the fix on `daaain/PtrHash@claude/eloquent-rubin-6u1o9u` (PR open upstream), not #2450's vendored copy.
  - Built and checked: `bench/parity.mjs` shows ids and per-token text matching transformers.js 3.7.3 for all 14 models, including Gemma 2.

Notes and follow-ups:

1. **Rebuilding.** `rustup target add wasm32-unknown-unknown` and `cargo install wasm-bindgen-cli --version 0.2.128` (it must equal the pinned crate), then `cargo build --release` in `bindings/wasm` and `wasm-bindgen --target web` (or `nodejs` for `bench/parity.mjs`) on `target/wasm32-unknown-unknown/release/tokenizers_wasm.wasm`. The API is `Tokenizer.from_json(json)`, `encode(text, { addSpecialTokens, padding: false, truncation: false })` and `decode_each(ids)`.
2. **Commented on #2450** (daaain, done): `+simd128` missing, the `decode` doc/default mismatch, the `node-release.yml` change that looks like it undoes #2448, `cargo fmt`, and the proposal for `decode_each`.
   - `+simd128` made no measurable encode difference in Node across six models (±noise at 10× the 40 KB text), so don't lean on it as a speed claim without browser numbers.
3. **`ptr_hash` PR** (was 1b, opened): reads the clock only when trace logging is on, never on `wasm32-unknown-unknown`. No new dependency. Once released, #2450 can drop its vendored copy.
4. **Optional, later:** faster `decode_each` (one string plus UTF-16 offsets instead of one JS string per token), load-time profiling of `from_json`, size (`opt-level`, `wasm-opt`). Each would be a PR against #2450's code once it lands, with numbers.

What stays in the app rather than the library: removing the `Strip` decoder (edit the JSON before `from_json`), the clean-up toggle (`clean_up_tokenization_spaces` is a transformers setting), fetching and caching from the Hub, and the worker pool (`bench/worker.js` is the prototype).

---

## Next: switch `online-llm-tokenizer` to the Rust tokenizers

**Goal:** replace transformers.js in this app with the Rust tokenizers' wasm binding, loaded in Web Workers.

1. **Vendor the build.** Vendor `bindings/wasm/pkg/` from the fork's `claude/wasm-integration` (later the `tokenizers-web` npm release) the same way `transformers.js` is vendored today (`tokenizer.js:1–2`), then delete `transformers.js` (873 KB).
2. **Rewrite `loadSingleTokenizer` / `updateSingleModel` against a small worker pool in the app.**
   - Fetch `https://huggingface.co/<repo>/resolve/main/tokenizer.json` with the Cache API, and give clear errors for missing and gated models.
   - One worker per model, so loading happens in parallel and off the main thread. This also resolves the `TODO` on `updateTokens`.
   - Keep progressive rendering: each card updates when its worker answers.
   - Drop superseded results when the text changes mid-tokenise, e.g. with a sequence number per request.
3. **Remove the old workarounds.**
   - Keep removing the `Strip` decoder, but on the JSON before `Tokenizer.from_json`.
   - The app already shows each token's real text (`" ."` rather than `"."`): `clean_up_tokenization_spaces` was switched off in favour of fidelity. Keep that as the default.
   - **Add a per-model clean-up toggle.** Each model card gets a small switch to show the output with the model's clean-up applied, using clean-up done in JS (transformers' `clean_up_tokenization`: `" ."`→`"."`, `" ?"`, `" !"`, `" ,"`, `" ' "`→`"'"`, `" n't"`, `" 'm"`, `" 's"`, `" 've"`, `" 're"`), with the model's default read from `tokenizer_config.json`. Default it to off, whatever the model's `tokenizer_config.json` says, but show that config default next to the switch.
     - This makes the difference visible, e.g. `"don"` + `" 't"` vs `"don't"`, and `" ."` vs `"."`.
     - Clean-up only changes the displayed text, never the token ids or count.
     - Consider remembering the toggles in localStorage and share links alongside the model list.
4. **Update error text for load failures.** Rust errors differ from transformers.js errors.
5. **Update the copy.**
   - `index.html` meta description ("using Transformers.js")
   - the "How it works" and "Implementation details" lists
   - `README.md` ("Pure client-side tokenization using transformers.js", Dependencies, Implementation Details), saying it's now the Rust tokenizers compiled to WebAssembly
6. **Remove this experiment.** Delete `experiments/tokenizers-wasm/` once the app runs on the binding (move `bench/` somewhere first if still useful).
7. **Verify in a browser.** Check the default models, a model added by name, a gated or missing model (error card), a share link, and a big paste (e.g. the page's own HTML ×10). Typing should stay smooth.
