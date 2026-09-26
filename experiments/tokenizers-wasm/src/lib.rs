use serde_json::Value;
use tk_encode::pipeline::{EncodeOptions, Override, PipelineTokenizer};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Tokenizer {
    inner: PipelineTokenizer,
}

fn js_err(e: impl ToString) -> JsError {
    JsError::new(&e.to_string())
}

/// Some tokenizers strip spaces when decoding; drop that step so each token shows its whitespace
fn remove_strip_decoder(config: &mut Value) {
    let Some(decoder) = config.get_mut("decoder") else {
        return;
    };
    if decoder.get("type").and_then(Value::as_str) == Some("Strip") {
        *decoder = Value::Null;
    } else if let Some(Value::Array(decoders)) = decoder.get_mut("decoders") {
        decoders.retain(|d| d.get("type").and_then(Value::as_str) != Some("Strip"));
    }
}

#[wasm_bindgen]
impl Tokenizer {
    /// Load from the text of a Hub `tokenizer.json` (legacy 1.0 format is upgraded first)
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str) -> Result<Tokenizer, JsError> {
        console_error_panic_hook::set_once();
        let mut config: Value = serde_json::from_str(json).map_err(js_err)?;
        remove_strip_decoder(&mut config);
        tk_convert::canonicalize_value(&mut config).map_err(js_err)?;
        let canonical = serde_json::to_string(&config).map_err(js_err)?;
        let inner = tk_serialize::from_json(&canonical).map_err(js_err)?;
        Ok(Tokenizer { inner })
    }

    pub fn encode(&self, text: &str, add_special_tokens: bool) -> Result<Vec<u32>, JsError> {
        // Never truncate or pad: the UI wants every token of the whole text
        let options = EncodeOptions {
            add_special_tokens,
            padding: Override::Off,
            truncation: Override::Off,
            ..Default::default()
        };
        let encodings = self.inner.encode(text, &options).wait().map_err(js_err)?;
        let encoding = encodings.first().ok_or_else(|| js_err("no encoding"))?;
        Ok(encoding.ids().iter().map(|&t| u32::from(t)).collect())
    }

    pub fn decode(&self, ids: &[u32], skip_special_tokens: bool) -> Result<String, JsError> {
        self.inner.decode(ids, skip_special_tokens).map_err(js_err)
    }

    /// Decode every id on its own, which is what the UI needs to label each token
    #[wasm_bindgen(js_name = decodeEach)]
    pub fn decode_each(&self, ids: &[u32]) -> Result<Vec<String>, JsError> {
        ids.iter()
            .map(|&id| self.inner.decode(&[id], false).map_err(js_err))
            .collect()
    }
}
