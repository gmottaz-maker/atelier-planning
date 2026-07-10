// Rendu HTML → PDF via Chromium headless.
// Sur Vercel : @sparticuz/chromium (binaire serverless). En local : Chrome système.
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function htmlToPdf(html) {
  const onLambda = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_VERSION
  const launchOpts = onLambda
    ? {
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
      }
    : {
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args: ['--no-sandbox'],
      }
  const browser = await puppeteer.launch(launchOpts)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    await browser.close()
  }
}
