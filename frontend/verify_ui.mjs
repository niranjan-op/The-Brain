import path from 'node:path'
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const ARTIFACT_DIR =
  'C:\\Users\\Niranjan\\.gemini\\antigravity\\brain\\ae8767de-9c2e-4870-bcef-1aafa3f1eaec'
const BASE_URL = 'http://127.0.0.1:4173'

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

  const previewServer = await preview({
    preview: {
      port: 4173,
      host: '127.0.0.1',
      strictPort: true,
    },
  })

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  })

  const consoleErrors = []

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()

    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('ERR_CONNECTION_REFUSED')) {
        consoleErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(String(err))
    })

    // 1. Verify /login page rendering & sign-in flow
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)

    const loginOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    if (loginOverflow) throw new Error('Horizontal overflow on /login at 1440px')

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'qa_login_route_1440.png'),
      fullPage: false,
    })

    await page.getByRole('button', { name: /Sign In & Call POST \/session\/start/i }).click()
    await page.waitForURL('**/projects')
    await page.waitForTimeout(300)

    // 2. Test /projects console interactions
    await page.getByRole('button', { name: /GET \/healthz/i }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: 'New Device ID' }).click()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Call POST /session/start' }).click()
    await page.waitForTimeout(200)

    const projectsOverflow1440 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    if (projectsOverflow1440) throw new Error('Horizontal overflow on /projects at 1440px')

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'qa_projects_route_1440.png'),
      fullPage: true,
    })

    // 3. Verify mobile responsiveness (390x844)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(250)
    const projectsOverflow390 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    if (projectsOverflow390) throw new Error('Horizontal overflow on /projects at 390px')

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'qa_projects_mobile_390.png'),
      fullPage: true,
    })

    console.log('Verification passed! Console errors:', consoleErrors.length)
    if (consoleErrors.length > 0) {
      console.error('Console errors:', consoleErrors)
      process.exitCode = 1
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => previewServer.httpServer.close(resolve))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
