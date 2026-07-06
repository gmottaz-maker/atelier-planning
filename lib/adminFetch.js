// Wrapper fetch pour les API admin (banking, factures, compta).
// L'identité n'est plus envoyée par header : les routes vérifient le JWT
// Supabase (injecté globalement dans _app.js). On garde ce wrapper comme
// point de passage unique si un traitement commun devient nécessaire.
export default function adminFetch(url, options = {}) {
  return fetch(url, options)
}
