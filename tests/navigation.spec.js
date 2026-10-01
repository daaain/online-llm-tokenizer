import { test, expect } from '@playwright/test'

// The third default model, so a row of cards above it grows as their tokens arrive
const LINKED_CARD = 'model-openai--gpt-oss-120b'
const SCROLL_MARGIN = 16
// Positions can be fractional, so allow a couple of pixels either way
const NEAR = -0.5

const topOf = (locator) => locator.evaluate((element) => element.getBoundingClientRect().top)

test.describe('linking to a model card', () => {
  test('scrolls to the card once it exists', async ({ page }) => {
    await page.goto(`/#${LINKED_CARD}`)

    await expect(page.locator(`#${LINKED_CARD}`)).toBeInViewport()
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
  })

  test('keeps the card in place while the cards above load', async ({ page }) => {
    await page.goto(`/#${LINKED_CARD}`)
    test.skip(
      !(await page.evaluate(() => CSS.supports('overflow-anchor', 'auto'))),
      'Needs scroll anchoring, which this browser lacks'
    )
    const card = page.locator(`#${LINKED_CARD}`)
    await expect.poll(() => topOf(card)).toBeCloseTo(SCROLL_MARGIN, NEAR)

    await expect(page.locator('.model-card.loading')).toHaveCount(0, { timeout: 30_000 })

    expect(await topOf(card)).toBeCloseTo(SCROLL_MARGIN, NEAR)
  })
})

test.describe('"All models" button', () => {
  test('is out of sight above the cards', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'All models' })).not.toBeInViewport()
  })

  test('floats in the bottom corner among the cards and goes back to the token counts', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.model-card.loading')).toHaveCount(0, { timeout: 30_000 })
    await page.locator('#models > li').first().evaluate((card) => card.scrollIntoView({ behavior: 'instant' }))

    const button = page.getByRole('link', { name: 'All models' })
    await expect(button).toBeInViewport()
    const box = await button.boundingBox()
    expect(box.y + box.height).toBeCloseTo(page.viewportSize().height - SCROLL_MARGIN, NEAR)

    await button.click()

    await expect.poll(() => topOf(page.locator('#token-count'))).toBeCloseTo(SCROLL_MARGIN, NEAR)
  })
})
