// Échéance par défaut d'une facture fournisseur.
//
// L'OCR ne trouve pas toujours l'échéance (et certaines factures n'en portent
// pas) : on retient le délai usuel de 30 jours après l'émission, quitte à le
// corriger à la main. Calcul en UTC volontaire — `new Date('2026-01-31')` est
// interprété en UTC, et mélanger avec des méthodes locales décale d'un jour
// selon le fuseau du serveur.

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function defaultDueDate(issueDate, days = 30, today = new Date()) {
  const base = ISO.test(String(issueDate || '').trim())
    ? new Date(`${String(issueDate).trim()}T00:00:00Z`)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}
