// Le squelette HTML, rendu par le SERVEUR à chaque requête.
//
// Ce fichier existe pour une raison précise, trouvée à l'audit : le `<Head>`
// de `_app.js` était placé APRÈS deux sorties anticipées — l'écran de
// chargement tant que l'authentification n'a pas répondu, et le `return null`
// d'une page protégée sans session. Au rendu serveur, `authReady` vaut
// toujours false : le serveur rendait donc l'écran de chargement et RIEN
// d'autre. Le HTML servi ne contenait ni lien vers le manifeste, ni
// apple-touch-icon, ni `viewport-fit=cover` — seulement le viewport par défaut
// de Next, `width=device-width`. Tout n'apparaissait qu'après hydratation.
//
// Ça finissait par marcher, mais l'application ne devenait une PWA qu'une fois
// le JavaScript exécuté, et le premier rendu se faisait sans safe-area.
// Ici, ces balises sont dans la réponse du serveur, quel que soit l'état de la
// session.
//
// Le VIEWPORT, lui, reste dans `_app.js` : Next en injecte un par défaut dès
// qu'il n'en trouve pas dans `next/head`, et on se retrouvait ici avec deux
// balises viewport — dont la première sans `initial-scale` ni `viewport-fit`.
import { Html, Head, Main, NextScript } from 'next/document'
import { AL } from '../lib/theme'

export default function Document() {
  return (
    // `lang` ne peut être posé QUE d'ici : React ne touche pas aux attributs
    // de <html>. Il manquait, et un lecteur d'écran lisait donc une interface
    // française avec une voix anglaise.
    <Html lang="fr">
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* `default` et non `black-translucent` : ce dernier ferait passer le
            contenu SOUS l'heure et la batterie, et il faudrait alors une marge
            haute en env(safe-area-inset-top) sur chaque page. Seule la marge
            BASSE est gérée aujourd'hui. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Maze Project" />

        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" href="/favicon.svg" sizes="any" />
        {/* PNG, et non SVG : iOS ne sait pas lire un SVG pour l'icône d'écran
            d'accueil — il fabrique à la place une capture de la page. Produit
            par `node scripts/icones-pwa.mjs` depuis le logo de la maison. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />

        {/* Le noir de la marque, celui de l'écran de chargement et du
            manifeste : l'écran de lancement d'iOS et le nôtre s'enchaînent
            alors sans clignotement blanc entre les deux. */}
        <meta name="theme-color" content={AL.black} />

        {/* Apercu Pro est servie en local (@font-face dans styles/globals.css).
            On précharge les deux graisses présentes dès le premier écran — la
            sidebar et les titres — pour éviter le saut de police. */}
        <link rel="preload" href="/fonts/apercu-pro-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/apercu-pro-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
