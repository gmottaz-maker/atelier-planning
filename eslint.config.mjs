// Configuration ESLint volontairement MINIMALE.
//
// Elle n'est pas là pour imposer un style — le dépôt n'en manque pas — mais
// pour attraper une classe de bug précise que ni le build ni les tests ne
// voient : l'identifiant libre.
//
// Le cas qui l'a motivée : `buildDevisHtml(project, company, level)` dans
// pages/api/send-document.js, où `level` n'était déclaré nulle part. Next
// compile sans broncher, la page se construit, et l'envoi d'une offre par
// e-mail part en ReferenceError chez le client. `no-undef` l'aurait dit avant
// le déploiement.
//
// Le jeu de règles reste donc très court, pour que `npm run lint` soit
// BLOQUANT en CI sans demander un chantier de remise à niveau. Ajouter des
// règles de style ici les rendrait bloquantes elles aussi : à faire seulement
// après avoir nettoyé le code qu'elles signalent.
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      '.next/**', 'node_modules/**', 'out/**', 'ios/**',
      'public/**', '.claude/**',
      // Références locales non versionnées : le bundle du design system n'est
      // pas notre code et n'a pas à être tenu à nos règles.
      'design_handoff_*/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,   // window, document, fetch, localStorage…
        ...globals.node,      // process, Buffer, console…
        ...globals.es2021,
      },
    },
    // Le greffon react-hooks est déclaré mais ses règles restent ÉTEINTES.
    // Sans lui, les `// eslint-disable-next-line react-hooks/exhaustive-deps`
    // déjà présents dans le code désignent une règle inconnue, ce qu'ESLint
    // signale comme une erreur. Le déclarer les rend valides sans rien rendre
    // bloquant de neuf. Activer ses règles est un chantier séparé.
    plugins: { 'react-hooks': reactHooks },
    linterOptions: {
      // Les `eslint-disable` visent des règles qu'on éteint volontairement ici.
      // Les déclarer « inutiles » serait trompeur : ils redeviendront utiles le
      // jour où ces règles seront activées.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    // Les fichiers de test ont leurs propres globales (describe, it, expect…),
    // injectées par Vitest.
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
