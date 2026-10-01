import { deflateRawSync } from 'node:zlib'
import { test, expect } from '@playwright/test'
import { mockHub } from './hub.js'

// Long enough that the old share links (~37 KB) went over the host's 14 KB URL limit
const LONG_TEXT = Array.from(
  { length: 300 },
  (_, line) => `${line}: 100% naïve llama 🦙 & "friends" #${line} + a/b?c=d\n`
).join('')

const compress = (text) => deflateRawSync(Buffer.from(text)).toString('base64url')
const shareLink = (text) => `/?models=Xenova/claude-tokenizer#text=${compress(text)}`

// Playwright's page.reload() is a fresh navigation in Firefox, unlike the browser's own reload
const reload = (page) => Promise.all([page.waitForNavigation(), page.evaluate(() => location.reload())])

// None of these need a tokenizer to finish loading
test.beforeEach(async ({ context }) => {
  await mockHub(context)
})

test.describe('share links', () => {
  test('open with the compressed text from the fragment', async ({ page }) => {
    await page.goto(shareLink(LONG_TEXT))

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
    const copiedLink = new URL(await page.evaluate(() => navigator.clipboard.readText()))

    expect([...copiedLink.searchParams]).toEqual([['models', 'Xenova/claude-tokenizer']])
    expect(copiedLink.hash.length).toBeLessThan(LONG_TEXT.length / 2)

    const sharedPage = await context.newPage()
    await sharedPage.goto(copiedLink.href)
    await expect(sharedPage.locator('#textInput')).toHaveValue(LONG_TEXT)
  })
})

test.describe('the text in a tab', () => {
  test('is kept after a reload', async ({ page }) => {
    await page.goto('/')
    await page.locator('#textInput').fill('My own text')

    await reload(page)

    await expect(page.locator('#textInput')).toHaveValue('My own text')
  })

  test('keeps the edits to a shared text after a reload', async ({ page }) => {
    await page.goto(shareLink('Shared text'))
    await expect(page.locator('#textInput')).toHaveValue('Shared text')
    await page.locator('#textInput').fill('Shared text, edited')

    await reload(page)

    await expect(page.locator('#textInput')).toHaveValue('Shared text, edited')
  })

  test('is kept after following a link to a card and reloading', async ({ page }) => {
    await page.goto(shareLink('Shared text'))
    await page.locator('#counts a').first().click()
    await expect(page).toHaveURL(/#model-/)

    await reload(page)

    await expect(page.locator('#textInput')).toHaveValue('Shared text')
  })

  test("gives way to a share link's text when one is opened", async ({ page }) => {
    await page.goto('/')
    await page.locator('#textInput').fill('My own text')

    await page.goto(shareLink('Shared text'))

    await expect(page.locator('#textInput')).toHaveValue('Shared text')
  })

  test('gives way to a second share link opened on the page', async ({ page }) => {
    await page.goto(shareLink('First shared text'))
    await expect(page.locator('#textInput')).toHaveValue('First shared text')

    // Only the fragment differs, so the browser doesn't load the page again
    await page.goto(shareLink('Second shared text'))

    await expect(page.locator('#textInput')).toHaveValue('Second shared text')
    await expect(page.locator('#charCount')).toHaveText('18 characters')
  })

  test("isn't shared with other tabs", async ({ page, context }) => {
    await page.goto('/')
    await page.locator('#textInput').fill('My own text')

    const otherTab = await context.newPage()
    await otherTab.goto('/')

    await expect(otherTab.locator('#textInput')).toHaveValue(/You are a friendly Llama/)
  })
})
