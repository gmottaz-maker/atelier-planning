// Rendu HTML → PDF via Chromium headless.
// Sur Vercel : @sparticuz/chromium (binaire serverless). En local : Chrome système.
//
// Deux précautions indispensables en serverless :
//
// 1. Les générations sont SÉRIALISÉES par conteneur. `chromium.executablePath()`
//    extrait le binaire dans /tmp ; deux appels simultanés dans le même
//    conteneur font lancer le binaire pendant qu'il est encore en écriture, ce
//    qui échoue en `spawn ETXTBSY`. C'est ce qui arrivait quand on cliquait
//    plusieurs fois sur « télécharger ».
// 2. Le chemin du binaire est mis en cache : inutile de le ré-extraire à chaque
//    appel, et cela évite de rouvrir la fenêtre de collision.
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const onLambda = () => !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_VERSION

let execPathPromise = null
function executablePath() {
  if (!execPathPromise) {
    execPathPromise = chromium.executablePath().catch(e => {
      execPathPromise = null   // un échec ne doit pas être mémorisé
      throw e
    })
  }
  return execPathPromise
}

// File d'attente : chaque rendu attend la fin du précédent dans ce conteneur.
let queue = Promise.resolve()

async function render(html) {
  const launchOpts = onLambda()
    ? {
        args: chromium.args,
        executablePath: await executablePath(),
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

export async function htmlToPdf(html) {
  // On s'enchaîne à la file, sans propager l'échec du rendu précédent.
  const mine = queue.then(() => render(html))
  queue = mine.catch(() => {})
  try {
    return await mine
  } catch (e) {
    // Filet de sécurité : si le binaire était malgré tout occupé (conteneur
    // partagé, extraction concurrente), on retente une fois après une pause.
    if (String(e?.message || '').includes('ETXTBSY')) {
      await new Promise(r => setTimeout(r, 600))
      const retry = queue.then(() => render(html))
      queue = retry.catch(() => {})
      return await retry
    }
    throw e
  }
}
