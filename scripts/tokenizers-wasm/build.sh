#!/usr/bin/env bash
# Rebuild the vendored tokenizers_wasm.js and tokenizers_wasm_bg.wasm from the Rust tokenizers.
# Needs: rustup target add wasm32-unknown-unknown; cargo install wasm-bindgen-cli --version 0.2.128
set -euo pipefail
cd "$(dirname "$0")"

# daaain/tokenizers@claude/wasm-integration: huggingface/tokenizers#2450 plus fixes not yet upstream
REPO=https://github.com/daaain/tokenizers
REV=d06c124
ROOT=../..

if [ ! -d tokenizers ]; then
  git clone --filter=blob:none "$REPO" tokenizers
fi
git -C tokenizers fetch -q origin claude/wasm-integration
git -C tokenizers checkout -q "$REV"

(cd tokenizers/bindings/wasm && cargo build --release)
wasm-bindgen --target web --no-typescript --out-dir "$ROOT" \
  tokenizers/bindings/wasm/target/wasm32-unknown-unknown/release/tokenizers_wasm.wasm
