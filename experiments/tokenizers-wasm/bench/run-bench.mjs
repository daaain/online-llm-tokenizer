import { chromium } from 'playwright-core'
const MODELS = process.argv[2]
const repeat = process.argv[3] || 1
const browser = await chromium.launch({ executablePath: 'process.env.CHROMIUM_PATH', args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))
page.on('pageerror', (e) => { console.error('pageerror:', e.message); process.exit(1) })
await page.goto(`http://localhost:8765/bench.html?models=${MODELS}&repeat=${repeat}`)
await page.waitForFunction(() => window.results, null, { timeout: 280000 })
const r = await page.evaluate(() => window.results)
const f = (x) => (x ?? NaN).toFixed(1).padStart(8)
console.log(`chars=${r.chars} wasmInit=${r.wasmInit.toFixed(1)}ms wasmMemory=${r.wasmMemoryMB.toFixed(0)}MB tjsHeap=${r.tjsHeapMB.toFixed(0)}MB`)
console.log('model'.padEnd(38), 'load tjs', ' load rs', ' enc tjs', '  enc rs', ' dec tjs', '  dec rs', '   ntok', 'same count')
for (const [m, x] of Object.entries(r.models)) console.log(m.padEnd(38), f(x.loadTjs), f(x.loadRs), f(x.encTjs), f(x.encRs), f(x.decTjs), f(x.decRs), String(x.ntok).padStart(7), x.ntok === x.ntokTjs)
console.log(`ALL MODELS encode+decode: transformers.js ${r.allTjs.toFixed(1)}ms, rust wasm ${r.allRs.toFixed(1)}ms  (${(r.allTjs / r.allRs).toFixed(1)}x)`)
await browser.close()
