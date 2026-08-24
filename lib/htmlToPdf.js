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

/** Concatène deux PDF en un seul. */
async function concatener(a, b) {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  for (const source of [a, b]) {
    const src = await PDFDocument.load(source)
    const pages = await doc.copyPages(src, src.getPageIndices())
    for (const p of pages) doc.addPage(p)
  }
  return Buffer.from(await doc.save())
}

// File d'attente : chaque rendu attend la fin du précédent dans ce conteneur.
let queue = Promise.resolve()

async function render(html, annexe) {
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
    const principal = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    if (!annexe) return principal

    // Le document annexe (bulletin QR) a ses propres marges de page : il ne
    // peut pas vivre dans le même document que le contenu, dont les marges
    // se répètent. On le rend à part, dans le même navigateur, puis on
    // concatène.
    const pageAnnexe = await browser.newPage()
    // `domcontentloaded` et non `networkidle0` : le bulletin QR est un SVG
    // inliné, sans police ni image à charger. Attendre l'inactivité réseau lui
    // coûtait plusieurs secondes pour rien — la génération d'une facture est
    // passée de 2 à 8 secondes le jour où ce second rendu a été ajouté.
    await pageAnnexe.setContent(annexe, { waitUntil: 'domcontentloaded' })
    const suite = await pageAnnexe.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    return await concatener(principal, suite)
  } finally {
    await browser.close()
  }
}

/**
 * HTML → PDF. `annexe` est un second document HTML dont les pages sont
 * concaténées à la suite : c'est ainsi que le bulletin QR d'une facture est
 * ajouté, avec ses propres marges de page.
 */
export async function htmlToPdf(html, annexe) {
  // On s'enchaîne à la file, sans propager l'échec du rendu précédent.
  const mine = queue.then(() => render(html, annexe))
  queue = mine.catch(() => {})
  try {
    return await mine
  } catch (e) {
    // Filet de sécurité : si le binaire était malgré tout occupé (conteneur
    // partagé, extraction concurrente), on retente une fois après une pause.
    if (String(e?.message || '').includes('ETXTBSY')) {
      await new Promise(r => setTimeout(r, 600))
      const retry = queue.then(() => render(html, annexe))
      queue = retry.catch(() => {})
      return await retry
    }
    throw e
  }
}
