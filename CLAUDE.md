# Maze Project — Contexte projet

Application de gestion de projets, horaires et frais pour Amazing Lab (atelier de fabrication).
URL production : https://mazeproject.amazinglab.ch

---

## Stack

- **Next.js 14** — Pages Router (pas App Router), JavaScript (pas TypeScript)
- **Supabase JS v2** — base de données PostgreSQL + auth
- **Tailwind CSS** — styles utilitaires
- **Vercel** — hébergement, déploiement auto depuis GitHub
- **Domaine** — Infomaniak, CNAME `mazeproject.amazinglab.ch` → `cname.vercel-dns.com`

---

## Structure des fichiers

Les pages marquées **(admin)** sont réservées à Guillaume : elles font
`if (user && !isAdmin) router.replace('/')` et s'appuient sur `useIsAdmin`.

```
pages/
  _app.js              — Auth Supabase, contexte global (useAuth), injection du JWT dans fetch
  login.js             — Connexion
  index.js             — Projets : cartes / kanban / gantt / liste (page principale)
  home.js              — Dashboard accueil + Google Agenda
  schedule.js          — Horaires, congés et frais (page principale des non-admins)
  tasks.js             — Tâches, toutes catégories
  planning.js          — Planning d'atelier
  meeting.js           — Vue réunion
  activity.js          — Journal d'activité
  display.js           — Affichage mural (route publique, sans chrome)
  settings.js          — Paramètres utilisateur
  peintures.js         — Sélecteur de peintures RUCO (voir section dédiée)
  clients.js           — Contacts et entreprises
  clients/[id].js      — Fiche contact
  catalog.js           — Catalogue d'articles et d'heures
  projects/[id].js     — Fiche projet : tâches, logistique, offre, fichiers
  projects/[id]/devis.js — Aperçu imprimable de l'offre

  finances.js          — (admin) Vue d'ensemble des finances
  offres.js            — (admin) Suivi des offres
  factures-emises.js   — (admin) Liste des factures clients
  factures-emises/[id].js — (admin) Facture : création et édition (page complète)
  factures-fournisseurs.js — (admin) Factures fournisseurs + scan
  justificatifs.js     — (admin) Frais et tickets + scan
  banque.js            — (admin) Import CAMT.053 et rapprochement
  compta.js            — (admin) Journal, décompte TVA, plan comptable
  stockage.js          — (admin) Inventaire de stockage et facturation trimestrielle

  api/                 — ~50 routes ; toutes vérifient le JWT via requireUser/requireAdmin
    projects/          — CRUD projets, fichiers, mises à jour, PDF de l'offre
    tasks/             — CRUD tâches + suggestions
    customer-invoices/ — Factures émises + PDF avec QR-bill
    supplier-invoices/ — Factures fournisseurs + OCR (scan.js)
    expenses/          — Frais (index, all pour l'admin, scan OCR)
    bank/              — Import CAMT, rapprochement, transactions
    compta/            — Journal comptable et export
    storage-*.js       — Stockage : groupes, articles, factures, cron trimestriel
    kdrive/            — Navigation, téléchargement et vignettes kDrive
    push/              — Notifications push
    send-document.js   — Envoi d'une offre ou facture par e-mail (Resend)
    accounts.js, catalog.js, contacts.js, email-templates.js, work-*.js, …

components/
  Sidebar.js · BottomNav.js · NavBar.js  — Navigation (desktop / mobile / en-tête)
  QuoteEditor.js         — Éditeur d'offre groupé, PARTAGÉ offre + facture
  QtyInput.js            — Champ quantité (pas de 0.5, premier cran à 1)
  CatalogPicker.js       — Insertion d'une ligne depuis le catalogue
  ContactPicker.js · BillingContactSelect.js — Choix d'un contact / d'un destinataire
  AddressInput.js · AutocompleteInput.js     — Saisie assistée
  TaskFormDrawer.js      — Création et édition d'une tâche
  SendDocumentModal.js   — Envoi d'un document par e-mail (modèles inclus)
  KDriveFolderPicker.js  — Choix d'un dossier kDrive

lib/
  supabase.js · supabase-server.js — Clients Supabase (navigateur / service-role)
  requireAdmin.js        — Vérification du JWT (requireUser, requireAdmin, cache 5 min)
  useIsAdmin.js · useIsMobile.js · useResponsibles.js · useSuggestions.js — Hooks
  swr.js                 — Cache SWR persisté en localStorage (voir /peintures)
  theme.js               — Jetons de style (C, FONT, MONO)
  devisHtml.js · factureHtml.js · htmlToPdf.js · pdfFilename.js — Génération des PDF
  quoteTotals.js · invoiceTotals.js · quoteStatus.js — Calculs offre / facture
  camt053.js · bankMatching.js · bankReconcile.js · reconcileRun.js — Banque
  comptaJournal.js       — Journal en partie double et décompte TVA
  supplierScan.js · receiptScan.js — Schémas et prompts OCR (Claude)
  supplierFile.js · receiptFile.js · pdfSplit.js — Nommage, classement, découpage
  merchantAccounts.js    — Apprentissage commerçant → compte comptable
  storageInvoice.js · storageBilling.js · invoiceNumber.js — Facturation
  kdrive.js · receipts.js — Stockage des fichiers
  projectPhase.js · supplierStatus.js · taskCategories.js — Modèles de statut
  todoist.js · googleCalendar.js · push-server.js · adminFetch.js

tests/                   — Vitest (npm test) : calculs, parsing CAMT, nommage, rapprochement
scripts/                 — Scripts ponctuels (imports, backfills), lancés à la main
*.sql                    — Migrations, à exécuter dans l'éditeur SQL Supabase
public/ruco/             — Données du sélecteur de peintures (voir section dédiée)
```

---

## Variables d'environnement (dans Vercel)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_GOOGLE_MAPS_KEY   (optionnel — fallback Nominatim si absent)
```

---

## Utilisateurs

```js
const KNOWN_USERS = ['Arnaud', 'Gabin', 'Guillaume']
const ADMIN_USER  = 'Guillaume'
```

L'auth est gérée par Supabase. Le nom d'utilisateur est stocké dans `user_metadata.name`.

---

## Conventions de code

- Jetons de style dans `lib/theme.js` (`C`, `FONT`, `MONO`). Plusieurs pages
  définissent encore un `const PINK = '#111827'` local (l'ancien rose `#FF4D6D`
  n'est plus utilisé nulle part).
- L'UI propre à une page reste dans son fichier ; ce qui sert à deux endroits ou
  plus part dans `components/` (voir la liste plus haut). `QuoteEditor` en est
  l'exemple : le même éditeur sert à l'offre et à la facture.
- Les API routes utilisent `lib/supabase-server.js` (service role) pour bypasser RLS
- Les pages client utilisent `lib/supabase.js`
- Formatage dates : `dateStr(d)` → `YYYY-MM-DD`, `parseDate(s)` → Date object

---

## Points techniques importants

### Supabase Web Lock (multi-onglets)
Le client Supabase désactive le Web Lock pour éviter les conflits entre onglets :
```js
// lib/supabase.js
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
})
```

### Auth init (_app.js)
`.catch()` ajouté sur `getSession()` pour éviter un crash si le lock est volé :
```js
supabase.auth.getSession().then(async ({ data: { session } }) => {
  // ...
  setAuthReady(true)
}).catch((err) => {
  console.warn('Auth init error:', err?.message)
  setAuthReady(true)
})
```

### TDZ fix (schedule.js)
`displayMonth` et `displayYear` doivent être déclarés AVANT les stats de frais (`expThisMonth`), sinon ReferenceError quand `expenses` est non-vide.

### Recherche d'adresse (index.js — AddressInput)
Utilise la nouvelle API Google Maps Places (`AutocompleteSuggestion` + `importLibrary`).
Fallback automatique sur Nominatim (OpenStreetMap) si pas de clé ou si Google échoue.

---

## Sélecteur de peintures (`/peintures`)

Aide au choix d'une peinture ou d'un vernis RUCO selon le support, la brillance,
le mode d'application et le délai de recouvrement. **Outil autonome** : aucun
lien avec le catalogue ni les devis (choix explicite — le catalogue RUCO n'est
pas prêt pour ça, et RUCO ne publie aucun prix hors connexion au shop).

- Page : `pages/peintures.js` — lien dans `MAIN_ITEMS` de `components/Sidebar.js`.
  Pas d'entrée dans `BottomNav` (nav mobile volontairement courte).
- Données : `public/ruco/products.json` (271 produits, 1799 réf., ~960 Ko) et
  `public/ruco/img/` (199 vignettes 90×90). Statique, pas de table Supabase.

### Deux contraintes à ne pas casser

**Ne pas charger ce JSON via SWR.** Le cache SWR est persisté en localStorage
(`lib/swr.js`) et réécrit la map entière ; 1 Mo y ferait sauter le quota, et
l'écriture étant dans un `try/catch` silencieux, cela casserait le cache de
toutes les autres pages sans message. La page utilise un `fetch` dans un
`useEffect`.

**Ne pas embarquer les vignettes en base64.** Next les sert depuis `public/`
avec cache CDN et lazy-loading ; en base64 elles entreraient dans le bundle.

### Rafraîchir le catalogue

Le pipeline d'extraction vit hors du repo, dans `~/ruco-selector` (Python 3,
sans dépendance) :

```bash
cd ~/ruco-selector && python3 scrape_ruco.py --refresh \
  && python3 normalize_ruco.py && python3 export_to_maze.py
```

`export_to_maze.py` réécrit `public/ruco/`. Voir `~/ruco-selector/README.md`
pour la méthode de normalisation (le texte des fiches RUCO est libre, et les
fiches se renvoient les unes aux autres — un lexique de marques neutralise ces
renvois, sans quoi un vernis intérieur ressort comme extérieur).

---

## Git / déploiement

```bash
# Remote avec token GitHub
git remote set-url origin https://gmottaz-maker:TOKEN@github.com/gmottaz-maker/atelier-planning.git

# Workflow standard
git add .
git commit -m "description"
git push  # → déclenche déploiement Vercel automatiquement
```

Token GitHub : Personal Access Token, scope `repo`, à renouveler sur github.com/settings/tokens.

---

## Capacitor (iOS — en cours)

Structure créée dans `ios/` mais setup CocoaPods non terminé.
```bash
# Pour reprendre le setup iOS :
cd ~/Documents/atelier-planning/ios/App
sudo gem install cocoapods
pod install
open App.xcworkspace
```
Config : `capacitor.config.json` — `server.url` pointe vers `https://mazeproject.amazinglab.ch`.

---

## Commandes utiles

```bash
npm run dev      # serveur local http://localhost:3000
npm run build    # build production
npx cap sync     # sync Capacitor après changements web
```
