import { test, expect } from '@playwright/test'
import { mockHub } from './hub.js'

const MODELS = [
  'Qwen/Qwen3-Next-80B-A3B-Instruct',
  'deepseek-ai/DeepSeek-V3.1-Terminus',
  'openai/gpt-oss-120b',
  'HuggingFaceTB/SmolLM3-3B',
  'Xenova/gemma2-tokenizer',
  'Xenova/claude-tokenizer',
]
const SCROLL_MARGIN = 16
// Positions can be fractional, so allow a couple of pixels either way
const NEAR = -0.5

const cardId = (model) => `model-${model.replace('/', '--')}`
// Some ids have a dot, which a #id selector would read as a class
const cardOf = (page, model) => page.locator(`[id="${cardId(model)}"]`)
const topOf = (locator) => locator.evaluate((element) => element.getBoundingClientRect().top)

/**
 * Releases a model's tokenizer and waits for its card to fill in
 */
async function load(page, hub, model) {
  hub.release(model)
  await expect(cardOf(page, model)).not.toHaveClass(/loading/)
}

/**
 * The linked card should sit at the top, or as near as it gets once the page is scrolled as far as it goes
 */
async function expectAtTop(card) {
  await expect
    .poll(() =>
      card.evaluate((element, margin) => {
        const top = element.getBoundingClientRect().top
        const scrolledToEnd = scrollY >= document.documentElement.scrollHeight - innerHeight - 1
        return Math.abs(top - margin) <= 1 || (scrolledToEnd && top > margin)
      }, SCROLL_MARGIN)
    )
    .toBe(true)
}

test.describe('linking to a model card', () => {
  const LINKED = { 'a card in the middle': MODELS[2], 'the last card': MODELS[5] }
  const ORDERS = {
    'the linked card first': (linked) => [linked, ...MODELS.filter((model) => model !== linked)],
    'the linked card last': (linked) => [...MODELS.filter((model) => model !== linked), linked],
    'from the bottom up': () => MODELS.toReversed(),
  }

  for (const width of [1280, 390])
    for (const [linkedName, linked] of Object.entries(LINKED))
      for (const [orderName, order] of Object.entries(ORDERS))
        for (const [timing, delay] of Object.entries({ 'as the page opens': 0, 'a second later': 1000 }))
          test(`${width}px wide, ${linkedName} stays in view with ${orderName} loading ${timing}`, async ({
            page,
            context,
          }) => {
            await page.setViewportSize({ width, height: 800 })
            const hub = await mockHub(context)
            await page.goto(`/#${cardId(linked)}`)
            const card = cardOf(page, linked)
            await expect(card).toHaveCSS('animation-name', 'highlight')
            await page.waitForTimeout(delay)

            for (const model of order(linked)) {
              await load(page, hub, model)
              await expectAtTop(card)
            }
          })

  test('lets the reader scroll away while the cards are still loading', async ({ page, context }) => {
    const hub = await mockHub(context)
    const linked = MODELS[2]
    await page.goto(`/#${cardId(linked)}`)
    const card = cardOf(page, linked)
    await expectAtTop(card)

    await page.mouse.wheel(0, -400)
    await expect.poll(() => topOf(card)).toBeGreaterThan(300)
    for (const model of MODELS) await load(page, hub, model)

    expect(await topOf(card)).toBeGreaterThan(300)
  })
})

test.describe('"All models" button', () => {
  test('is out of sight above the cards', async ({ page, context }) => {
    await mockHub(context)
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'All models' })).not.toBeInViewport()
  })

  test('floats in the bottom corner among the cards and goes back to the token counts', async ({
    page,
    context,
  }) => {
    const hub = await mockHub(context)
    await page.goto('/')
    for (const model of MODELS) await load(page, hub, model)
    await cardOf(page, MODELS[0]).evaluate((card) => card.scrollIntoView({ behavior: 'instant' }))

    const button = page.getByRole('link', { name: 'All models' })
    await expect(button).toBeInViewport()
    const box = await button.boundingBox()
    expect(box.y + box.height).toBeCloseTo(page.viewportSize().height - SCROLL_MARGIN, NEAR)

    await button.click()

    await expect.poll(() => topOf(page.locator('#token-count'))).toBeCloseTo(SCROLL_MARGIN, NEAR)
  })
})
