use std::time::Instant;
fn main() {
    let text = std::fs::read_to_string("bench/text.txt").unwrap();
    for m in std::env::args().skip(1) {
        let json = std::fs::read_to_string(format!("bench/models/{m}/tokenizer.json")).unwrap();
        let t = Instant::now();
        let c = tk_convert::canonicalize_str(&json).unwrap();
        let ct = t.elapsed();
        let t = Instant::now();
        let tk = tk_serialize::from_json(&c).unwrap();
        let ft = t.elapsed();
        let t = Instant::now();
        let n = tk.encode(text.as_str(), &Default::default()).wait().unwrap()[0].len();
        println!("{m:36} canonicalize {ct:>9.1?} from_json {ft:>9.1?} encode {:>8.1?} ({n} tokens)", t.elapsed());
    }
}
