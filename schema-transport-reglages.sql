-- ═══════════════════════════════════════════════════════════════════════════
-- Transport : véhicules, forfaits de ville et coûts — valeurs de départ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deux clés de app_settings (lib/transport.js) :
--   transport        noms des véhicules, forfaits avec prix et distance
--                    aller-retour — lisible par tous, l'éditeur d'offre en a
--                    besoin ;
--   couts_vehicules  leasing, taxes, assurance, entretien, km par an et
--                    consommation de chaque véhicule, prix du diesel —
--                    lisible par l'ADMIN seul.
--
-- Chiffres donnés le 11 septembre 2026 ; forfaits relevés le même jour à
-- Lausanne 85.–, Genève 370.–, Zurich 1 000.–. Durées aller-retour estimées
-- (30 min, 1 h 30, 4 h 45) ; vitesse moyenne de 70 km/h pour les lignes au km.
-- Consommations : usage réel relevé
-- par des propriétaires (Master L3H3 ~10 l/100, Vito 113 CDI 4MATIC
-- ~9,3 l/100). Diesel : 2,26 CHF/l (TCS, 3 septembre 2026). Tout se modifie
-- ensuite dans Réglages → Transport.
--
-- ON CONFLICT DO NOTHING : rejouer ce fichier n'écrase jamais des réglages
-- modifiés depuis.
INSERT INTO app_settings (key, value, updated_at) VALUES
('transport', '{
  "vehicules": [
    {"id": "master", "nom": "Renault Master"},
    {"id": "vito",   "nom": "Mercedes Vito"}
  ],
  "forfaits": [
    {"id": "lausanne", "nom": "Lausanne", "prix": 85,   "km": 12,  "duree": 30},
    {"id": "geneve",   "nom": "Genève",   "prix": 370,  "km": 120, "duree": 90},
    {"id": "zurich",   "nom": "Zurich",   "prix": 1000, "km": 455, "duree": 285}
  ]
}', NOW()),
('couts_vehicules', '{
  "prix_diesel": 2.26,
  "vitesse_moyenne": 70,
  "vehicules": {
    "master": {"leasing_mensuel": 479, "taxe": 700, "assurance": 2300, "vignette": 40, "pneus": 400,
               "service": 800, "tcs": 107, "autres": 0, "km_annuels": 10000, "conso": 10},
    "vito":   {"leasing_mensuel": 0,   "taxe": 700, "assurance": 1000, "vignette": 40, "pneus": 400,
               "service": 800, "tcs": 107, "autres": 0, "km_annuels": 10000, "conso": 9.3}
  }
}', NOW())
ON CONFLICT (key) DO NOTHING;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DELETE FROM app_settings WHERE key IN ('transport', 'couts_vehicules');
