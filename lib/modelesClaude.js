// Les modèles Claude utilisés par l'application, en un seul endroit.
//
// Ils étaient écrits en dur dans trois fichiers. Le 10 septembre 2026,
// `claude-3-5-haiku-20241022` a été retiré de l'API : la synthèse de projet et
// le briefing de visite sur site sont tombés en 404 du jour au lendemain, sans
// que rien n'ait changé dans le code. Un modèle retiré est un événement
// prévisible ; le chercher dans trois fichiers ne l'est pas.
//
// La liste vivante se relit à tout moment :
//   curl https://api.anthropic.com/v1/models \
//     -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"

/** Rapide et bon marché : résumés, synthèses, reformulations. */
export const MODELE_RAPIDE = 'claude-haiku-4-5-20251001'

/** Lecture fine de documents : OCR des justificatifs et des factures. */
export const MODELE_PRECIS = 'claude-opus-4-8'
