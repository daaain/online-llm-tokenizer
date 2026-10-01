import { test, expect } from '@playwright/test'

// The one test that loads a real tokenizer, so it needs network access
test.describe.configure({ retries: 1 })

test('loads a tokenizer from Hugging Face', async ({ page }) => {
  await page.goto('/?models=Xenova/claude-tokenizer')

  await expect(page.locator('.model-count strong')).toHaveText(/^\d+$/, { timeout: 30_000 })
})
