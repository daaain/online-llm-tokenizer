import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PORT ?? 4173)

// The tests load real tokenizers from Hugging Face, so they need network access
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    // http.server logs every request to stderr
    stderr: 'ignore',
  },
})
