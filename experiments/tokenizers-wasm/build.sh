#!/usr/bin/env bash
# Build the Rust tokenizer to WASM: fetch the pinned sources, apply the two patches, compile and bind
set -euo pipefail
cd "$(dirname "$0")"

TOKENIZERS_REV=bbccb0513ff9afda385ca5c85c66eddb1318cfc7
PTR_HASH_VERSION=2.1.1

if [ ! -d vendor/tokenizers ]; then
  git clone https://github.com/huggingface/tokenizers vendor/tokenizers
  git -C vendor/tokenizers checkout "$TOKENIZERS_REV"
  git -C vendor/tokenizers apply ../../patches/tokenizers-byte-fallback.patch
fi
if [ ! -d vendor/ptr_hash ]; then
  mkdir -p vendor/ptr_hash
  curl -sSL "https://crates.io/api/v1/crates/ptr_hash/$PTR_HASH_VERSION/download" | tar xz -C vendor/ptr_hash --strip-components 1
  patch -d vendor/ptr_hash -p1 < patches/ptr_hash-web-time.patch
fi

rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
WASM=target/wasm32-unknown-unknown/release/tk_wasm.wasm
wasm-bindgen --target web --out-dir bench/pkg-web "$WASM"
wasm-bindgen --target nodejs --out-dir bench/pkg-node "$WASM"
