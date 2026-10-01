import { deflateRawSync } from 'node:zlib'
import { test, expect } from '@playwright/test'

// Long enough that the old share links (~37 KB) went over the host's 14 KB URL limit
const LONG_TEXT = Array.from(
  { length: 300 },
  (_, line) => `${line}: 100% naïve llama 🦙 & "friends" #${line} + a/b?c=d\n`
).join('')

const compress = (text) => deflateRawSync(Buffer.from(text)).toString('base64url')

test.describe('share links', () => {
  test('open with the compressed text from the fragment', async ({ page }) => {
    await page.goto(`/?models=Xenova/claude-tokenizer#text=${compress(LONG_TEXT)}`)

    await expect(page.locator('#textInput')).toHaveValue(LONG_TEXT)
    await expect(page.locator('#models > li')).toHaveCount(1)
  })

  test('still open with the text from the query of older links', async ({ page }) => {
    const text = 'Old link: 50% off & more'
    const oldLink = new URL('/', 'http://localhost')
    oldLink.searchParams.set('text', encodeURIComponent(text))

    await page.goto(oldLink.pathname + oldLink.search)

    await expect(page.locator('#textInput')).toHaveValue(text)
  })

  test('open hand-written links whose text has a percent sign', async ({ page }) => {
    await page.goto('/?text=100%25%20sure')

    await expect(page.locator('#textInput')).toHaveValue('100% sure')
    await expect(page.locator('#charCount')).toHaveText('9 characters')
  })

  test('keep the default text when the fragment is malformed', async ({ page }) => {
    await page.goto('/#text=not-deflated')

    await expect(page.locator('#textInput')).toHaveValue(/You are a friendly Llama/)
  })

  test('copy a link that sends only the model list to the server and restores the text', async ({
    page,
    context,
    browserName,
  }) => {
    // Firefox reads it thanks to a testing preference in the config
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    if (browserName === 'webkit') await context.grantPermissions(['clipboard-read'])
    await page.goto('/?models=Xenova/claude-tokenizer')
    await page.locator('#textInput').fill(LONG_TEXT)

    await page.getByRole('button', { name: 'Copy share link' }).click()
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()
    const shareLink = new URL(await page.evaluate(() => navigator.clipboard.readText()))

    expect([...shareLink.searchParams]).toEqual([['models', 'Xenova/claude-tokenizer']])
    expect(shareLink.hash.length).toBeLessThan(LONG_TEXT.length / 2)

    const sharedPage = await context.newPage()
    await sharedPage.goto(shareLink.href)
    await expect(sharedPage.locator('#textInput')).toHaveValue(LONG_TEXT)
  })
})
