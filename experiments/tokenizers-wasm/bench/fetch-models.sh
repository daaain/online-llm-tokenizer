#!/usr/bin/env bash
# Download tokenizer files for the benchmarks into bench/models, plus the text they tokenize
set -euo pipefail
cd "$(dirname "$0")"
MODELS=(
  Qwen/Qwen3-Next-80B-A3B-Instruct deepseek-ai/DeepSeek-V3.1-Terminus openai/gpt-oss-120b
  HuggingFaceTB/SmolLM3-3B Xenova/gemma2-tokenizer Xenova/claude-tokenizer
  TinyLlama/TinyLlama-1.1B-Chat-v1.0 microsoft/Phi-3-mini-4k-instruct Xenova/gpt-4o zai-org/GLM-4.5
  Xenova/bert-base-uncased Xenova/t5-small Xenova/xlm-roberta-base mistralai/Mistral-Nemo-Instruct-2407
)
for model in "${MODELS[@]}"; do
  mkdir -p "models/$model"
  for file in tokenizer.json tokenizer_config.json; do
    curl -sSfL -o "models/$model/$file" "https://huggingface.co/$model/resolve/main/$file"
  done
done
ROOT=../../..
cat $ROOT/index.html $ROOT/tokenizer.js $ROOT/tokenizer.css $ROOT/README.md > text.txt
cp $ROOT/transformers.js .
