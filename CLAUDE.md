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
  display.js           — Affichage mural (route publique, sans chrome ; lit
                         /api/display-projects, DTO réduit — voir Sécurité)
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
  ApiErrorBanner.js      — Bandeau des mutations API en échec (monté dans _app)
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
  requireAdmin.js        — JWT (requireUser, requireAdmin, requireCronOrAdmin, cache 5 min)
  taskAccess.js          — Visibilité des tâches privées (appliquée côté serveur)
  invoiceCheck.js        — Validation et recalcul serveur des montants de facture
  fetchTimeout.js        — fetch avec délai maximal, pour tous les appels sortants
  apiError.js            — Réponses d'erreur normalisées + journalisation nettoyée
  api.js                 — Client API : res.ok, erreurs typées, annulation
  projectHelpers.js      — Calculs et formatage de la fiche projet
  fileType.js            — Type réel d'un fichier déposé + en-têtes de réponse
  kdriveAccess.js · signedRef.js — Autorisation d'accès aux fichiers kDrive
  useIsAdmin.js · useIsMobile.js · useResponsibles.js · useSuggestions.js — Hooks
  swr.js                 — Cache SWR persisté en localStorage (voir /peintures)
  theme.js               — Jetons de style (C, FONT, MONO)
  devisHtml.js · factureHtml.js · htmlToPdf.js · pdfFilename.js — Génération des PDF
  quoteLines.js          — Modèle des lignes d'offre : 3 niveaux, totaux, masquage
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

tests/                   — Vitest (npm test) : calculs, parsing, nommage, autorisations
scripts/                 — Scripts ponctuels et contrôles :
                           check-secrets.mjs (CI), check-db.mjs (état des migrations)
*.sql                    — Migrations, à exécuter dans l'éditeur SQL Supabase
public/ruco/             — Données du sélecteur de peintures (voir section dédiée)
```

---

## Variables d'environnement (dans Vercel)

Indispensables — sans elles l'app ne démarre pas :

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Par fonctionnalité — l'app démarre sans, mais la fonction concernée est hors service :

```
ANTHROPIC_API_KEY          OCR des factures fournisseurs et des justificatifs
RESEND_API_KEY             Envoi des offres et factures par e-mail
MAIL_FROM, MAIL_BCC        Expéditeur et copie cachée (optionnels)
KDRIVE_TOKEN               Fichiers sur kDrive (pièces, dossiers projet)
KDRIVE_DRIVE_ID
CRON_SECRET                Authentifie le cron des factures de stockage
TODOIST_API_TOKEN          Synchronisation des tâches
TODOIST_WEBHOOK_SECRET     Import de projets depuis Todoist
ODOO_URL, ODOO_DB, ODOO_API_KEY        Synchro clients (hors service, clés à renouveler)
VAPID_PRIVATE_KEY                      Notifications push
NEXT_PUBLIC_VAPID_PUBLIC_KEY
NEXT_PUBLIC_GOOGLE_MAPS_KEY            Adresses (repli Nominatim si absente)
NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID  Google Agenda sur la page Accueil
CHROME_PATH                Chemin de Chrome en local pour générer les PDF
```

Coordonnées imprimées sur les offres, factures et QR-bills :

```
AMAZING_LAB_NAME, AMAZING_LAB_ADDRESS, AMAZING_LAB_ZIP, AMAZING_LAB_CITY,
AMAZING_LAB_COUNTRY, AMAZING_LAB_IBAN, AMAZING_LAB_VAT,
AMAZING_LAB_EMAIL, AMAZING_LAB_PHONE, AMAZING_LAB_WEBSITE
```

---

## Utilisateurs

```js
const KNOWN_USERS = ['Arnaud', 'Gabin', 'Guillaume']
```

**Les droits viennent de `profiles.role`**, pas d'un nom écrit dans le code.
Au 18 août 2026 : Guillaume et Arnaud sont `admin`, Gabin est `member`.
Pour changer, une seule requête — aucun déploiement :

```sql
UPDATE profiles SET role = 'admin' WHERE name = 'Arnaud';   -- ou 'member' pour retirer
```

`ADMIN_USER` subsiste dans `lib/requireAdmin.js` comme unique repli si la
colonne `role` venait à manquer. Il ne doit servir à rien d'autre.

L'auth est gérée par Supabase. **Le nom d'utilisateur vient de la table
`profiles`, pas de `user_metadata`** — `user_metadata.name` est vide pour les
trois comptes. C'est important : `profiles` est lu de façon asynchrone après
l'ouverture de session, donc `user.name` vaut d'abord l'e-mail pendant un court
instant.

Conséquence, déjà à l'origine d'un bug : un test du type
`user.name === 'Guillaume'` est momentanément faux au chargement, et le
garde-fou des pages admin (`if (user && !isAdmin) router.replace('/')`)
renvoyait à l'accueil. `lib/useIsAdmin.js` reconnaît donc aussi l'admin par son
e-mail, disponible dès le premier rendu, et `_app.js` met le nom du profil en
cache dans le localStorage.

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

**Ne jamais mettre de jeton dans l'URL du remote.** Un PAT écrit dans
`.git/config` s'y trouve en clair, part dans toute copie du dépôt et n'expire
pas. Utiliser SSH, ou le gestionnaire d'identifiants de git :

```bash
# SSH (recommandé)
git remote set-url origin git@github.com:gmottaz-maker/atelier-planning.git

# ou HTTPS + trousseau macOS, le jeton n'est saisi qu'une fois
git config --global credential.helper osxkeychain
git remote set-url origin https://github.com/gmottaz-maker/atelier-planning.git
```

```bash
# Workflow standard
git add .
git commit -m "description"
git push  # → déclenche déploiement Vercel automatiquement
```

---

## Capacitor (iOS — en cours)

Structure créée dans `ios/` mais setup CocoaPods non terminé.
```bash
# Pour reprendre le setup iOS :
cd ~/atelier-planning/ios/App
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

---

## Sécurité — invariants à ne pas casser

Ces règles sont le résultat de correctifs, pas des préférences de style. Les
casser rouvre une faille précise.

**Une seule route publique : `/api/display-projects`.** Elle sert l'écran mural
de l'atelier, qui n'a pas de session. Elle n'expose qu'une liste blanche de
9 colonnes, gardée par un test. `GET /api/projects` fait un `select('*')` —
notes, adresses, contacts, `quote_data` avec prix d'achat et marges — et exige
donc un JWT.

**Toute autorisation se vérifie côté serveur.** Masquer un bouton ou rediriger
en React ne protège rien. `lib/requireAdmin.js` : `requireUser`,
`requireAdmin`, `requireCronOrAdmin` (secret cron comparé à temps constant).
Les routes cron et de configuration exigent l'admin, pas un simple compte
vérifié.

**L'identité vient du JWT, jamais du corps de la requête.** Un champ `user`,
`author` ou `x-actor` envoyé par le navigateur est une déclaration, pas une
identité.

**`app_settings` est admin en écriture.** Cette table porte l'IBAN et la raison
sociale imprimés sur les factures. La lecture est limitée aux clés dont
l'interface a besoin.

**Les tâches privées se filtrent côté serveur** (`lib/taskAccess.js`), en
lecture comme en mutation. Une tâche interdite renvoie 404, pas 403 : un 403
confirmerait son existence.

**Les fichiers ne sont jamais crus sur parole** (`lib/fileType.js`). Type,
extension et taille viennent du contenu binaire. HTML et SVG sont refusés — ils
s'exécuteraient dans l'origine de Maze. Seules les images raster vérifiées
partent en `inline` ; tout le reste en `attachment`, avec `nosniff`. Le HEIC est
stocké mais jamais servi inline : `pages/schedule.js` envoie les photos iPhone
telles quelles.

**Un identifiant kDrive venant du navigateur n'est pas une autorisation.** Le
serveur a un token très privilégié. Soit le fichier est référencé en base et
`lib/kdriveAccess.js` tranche, soit il présente un jeton signé
(`lib/signedRef.js`) que le serveur a lui-même émis en le listant. La
navigation ne part que de la racine du projet. Les pièces comptables sont
réservées à l'admin, les frais à leur auteur.

**L'admin se reconnaît à son RÔLE** (`profiles.role`), jamais à son nom ni à
son e-mail. `isAdminUser` côté serveur, `useIsAdmin` côté client. Renommer un
profil ne doit pas changer ses droits.

**Les montants d'une facture sont recalculés côté serveur** depuis
`quote_snapshot` (`lib/invoiceCheck.js`), et refusés au-delà d'un centime
d'écart. Le recalcul réutilise `computeQuoteTotal`, la fonction de l'éditeur :
une seconde implémentation finirait par diverger et refuserait des factures
justes. Une facture envoyée ou payée s'annule, ne se supprime pas.

**Les opérations financières multi-tables passent par une fonction PostgreSQL**
(`reconcile_match`, `next_invoice_number`). Deux UPDATE successifs depuis
l'application ne sont pas atomiques, et un SELECT max + 1 n'est pas concurrent.
Le code retombe sur l'ancien chemin si la fonction est absente, en le
signalant dans les logs — c'est un filet de déploiement, pas un mode normal.

**Tout appel sortant a un délai maximal** (`lib/fetchTimeout.js`). Sans lui,
une dépendance muette immobilise la fonction serverless jusqu'à son plafond, et
les rendus PDF, sérialisés par conteneur, attendent derrière.

**Aucune route ne renvoie le message brut d'un fournisseur.** Les messages de
Supabase et de kDrive exposent colonnes, contraintes et parfois des valeurs.
Le détail va dans les logs via `erreurApi` (`lib/apiError.js`), le navigateur
reçoit un code stable et un identifiant de requête.

**Jamais `{ ...req.body }` dans un insert ou un update.** Une liste blanche
explicite : sinon toute colonne devient inscriptible, y compris celles ajoutées
plus tard.

**Une mutation qui échoue doit se voir.** L'intercepteur de `_app.js` signale
toute mutation `/api/` dont la réponse n'est pas `ok`, et `ApiErrorBanner`
l'affiche avec l'identifiant de requête. Sans ça, un bouton peut répondre 405
sans que rien ne bouge à l'écran — c'est arrivé. Les échecs de LECTURE ne
déclenchent rien : l'écran les montre déjà par son état vide.

**Une ligne masquée disparaît du document, jamais des totaux.** `hidden: true`
est un filtre d'affichage : le montant remonte au parent, qui reste visible.
C'est ce qui permet de chiffrer au détail sans imposer au client une offre
longue comme le bras. `lib/quoteLines.js` est la seule source du barème et de
la mise à plat — l'éditeur, le PDF et la validation serveur des factures
doivent compter pareil, sinon une facture juste finit refusée.

**Trois niveaux dans Fabrication** : item → élément (facultatif) → composition.
Seule la composition porte des quantités et des prix ; un item et un élément
valent la somme de ce qu'ils contiennent. La graisse suit le RÔLE de la ligne,
pas sa profondeur : une composition n'est jamais en gras, qu'elle tienne sous
un item ou sous un élément.

**Les marges d'un document PDF viennent de `@page`, jamais d'un `padding`.**
Un padding ne s'applique qu'au début et à la fin du bloc : à partir de la
page 2, le texte touchait le bord du papier. Corollaire : le bulletin QR d'une
facture est un DOCUMENT SÉPARÉ (`qrDocument`), rendu avec ses propres marges
puis concaténé par `htmlToPdf(html, annexe)`. Les pages CSS nommées
(`@page bulletin { margin: 0 }`) auraient évité ça, mais Chrome ne les honore
pas — vérifié, il insère une page blanche.

**Les montants ne passent pas par `Intl`** (`lib/money.js`). Le séparateur de
milliers de `fr-CH` dépend de la version d'ICU embarquée dans Node : la CI et
le poste de développement ne produisaient pas le même texte, et surtout, le
séparateur imprimé sur une facture dépendait de la version que Vercel
exécutait ce jour-là. L'apostrophe suisse est écrite explicitement.

**Rien de sensible dans le localStorage.** Le cache SWR est en mémoire. Y
remettre une persistance globale y replacerait factures, données bancaires,
contacts et marges, qui survivraient à la déconnexion sur un poste partagé.

---

## Migrations SQL — ordre d'application

Les fichiers `*.sql` s'exécutent à la main dans l'éditeur SQL Supabase. Ceux
qui restent à jouer sont listés ici, dans l'ordre. Une migration doit être
exécutée **avant** le déploiement du code correspondant : le code sait retomber
sur l'ancien comportement si l'objet manque, l'inverse n'est pas vrai.

| Fichier | Contenu | Rollback |
|---|---|---|
| `schema-profiles-role.sql` | colonne `profiles.role` | `ALTER TABLE profiles DROP COLUMN role;` |
| `schema-integrite-financiere.sql` | `reconcile_match()`, `next_invoice_number()`, `storage_billing_key`, index d'unicité | en fin de fichier |

`schema-integrite-financiere.sql` commence par deux requêtes de contrôle à
passer d'abord : les index uniques échouent si des doublons existent déjà.

`schema-security-lockdown.sql` reste à exécuter **en dernier** si l'ensemble est
rejoué depuis zéro.

---

## Contrôles automatiques

```bash
npm test                # 274 tests, dont l'inventaire et la matrice d'autorisation
npm run check:secrets   # balaie les fichiers suivis par git (tourne en CI)
npm run check:db        # vérifie que les migrations attendues sont en base
```

`tests/rbac.test.js` mérite une mention : il ne teste pas un comportement mais
tient l'**inventaire** des routes API et de leur niveau d'autorisation. Il
échoue si une route apparaît sans contrôle, si une route sensible est
rétrogradée, si un secret revient à une comparaison `===`, si l'admin est
accordé sur un nom, si une route renvoie un message brut de fournisseur, ou si
elle écrit le corps de la requête en bloc. Ajouter une route publique demande
donc de l'inscrire explicitement dans `SANS_JWT`, avec sa raison.

`tests/apiAuth.test.js` exerce les VRAIS handlers d'une vingtaine de routes,
avec anonyme / membre / autre membre / admin. Seuls le client Supabase et les
services externes sont simulés ; toute la chaîne d'autorisation est le code de
production. Deux pièges à connaître si tu ajoutes des cas :

- remplacer un export par `vi.mock` ne change PAS les appels internes au module
  (`requireCronOrAdmin` appelle le vrai `requireAdmin`). C'est pourquoi la
  simulation se fait au niveau de `auth.getUser`, sous toute la chaîne ;
- plusieurs routes font `const supabase = getSupabaseServer()` au niveau module,
  donc une seule fois à l'import. Le mock rend un proxy vers la base du test en
  cours, sinon toutes les routes resteraient figées sur la première.

La CI (`.github/workflows/ci.yml`) exécute tests, build, audit des dépendances
(bloquant sur « critical » seulement) et détection de secrets. Elle n'a accès
ni à la base ni aux secrets de production.
