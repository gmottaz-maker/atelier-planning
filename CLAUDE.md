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
  outils/index.js      — Index des outils d'atelier
  outils/peintures.js  — Peintures RUCO : sélecteur + chiffrage (section dédiée)
  peintures.js         — Redirection vers /outils/peintures (anciens signets)
  clients.js           — Annuaire des SOCIÉTÉS (lignes) + personnes sans société
  clients/[id].js      — Fiche société ou personne ; affiche le journal de
                         démarchage si la société vient d'un prospect converti
  prospects.js         — (admin) Prospection : liste triée par relance due
  prospects/[id].js    — (admin) Fiche prospect : journal, relances, conversion
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
    prospects/         — Prospection : fiche, personnes, journal, conversion
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
  paintPrices.js         — Tarif RUCO d'atelier (20 produits, prix facturés)
  paintCalc.js           — Chiffrage peinture : quantités, coût matière, temps
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
  projectPhase.js · supplierStatus.js · customerStatus.js · taskCategories.js — Statuts
  prospects.js           — Prospection : étapes, canaux, sources, calcul des relances
  aujourdhui.js          — Date du jour en YYYY-MM-DD (source unique, voir plus bas)
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

## Outils (`/outils`)

Aides au travail d'atelier, sans lien avec les projets, les devis ou la
comptabilité. Chaque outil est autonome. Pour en ajouter un : une page sous
`pages/outils/`, une entrée dans la liste de `pages/outils/index.js`, et le
calcul dans `lib/` pour qu'il soit testable.

Entrée `Outils` dans `MAIN_ITEMS` de `components/Sidebar.js`. Pas d'entrée dans
`BottomNav` (nav mobile volontairement courte).

### Peintures RUCO (`/outils/peintures`)

Choix du produit ET chiffrage du travail, dans une seule page. `/peintures`
redirige vers cette adresse — les signets d'avant le regroupement restent bons.

**Deux jeux de données que le SKU relie :**

- le CATALOGUE technique, `public/ruco/products.json` (271 produits, 1799 réf.,
  ~960 Ko) et `public/ruco/img/` (199 vignettes) : quel produit pour quel
  support, quelle brillance, quel mode d'application. Statique, pas de Supabase ;
- le TARIF d'atelier, `lib/paintPrices.js` (20 produits) : prix HT réellement
  facturés par RUCO, ratios 2K, dilutions, rendements, densités.

`articles[].sku` du catalogue = `ref` du tarif. Les 19 références du tarif se
retrouvent toutes dans le catalogue — c'est ce qui permet de chiffrer sans
quitter la fiche produit. Un produit tarifé porte le badge « chiffrable ».

**Trois règles héritées du dépouillement des factures, à ne pas défaire :**

1. Un prix inconnu vaut `null`, jamais 0. Un produit facturé à 100 % de rabais
   n'a pas un prix catalogue nul : il a un prix qu'on ignore.
2. Les données de pulvérisation sont celles du GODET GRAVITÉ (pistolet HVLP de
   l'atelier). Les valeurs Airmix et Airless des fiches techniques n'entrent pas.
3. `dilRetenue`, `tempsA0` et les coefficients A0–A4 sont des HYPOTHÈSES
   Amazing Lab, à recalibrer sur des essais réels — pas des données RUCO.

**Deux facteurs de surconsommation, à ne pas confondre.** `quantite` (dans les
niveaux de complexité) est la surconsommation due à la FORME de la pièce :
chants, retours, recoins où le pistolet repasse et où le brouillard se perd.
`pertes` (réglage du chiffrage) couvre l'amorçage, le réglage et le fond de
godet, qui valent même sur un panneau plat. Les deux se multiplient et ne se
remplacent pas. `quantite` s'appelait `matiere` ; `normaliserComplexites()`
relit encore l'ancienne clé, et n'écrit que la nouvelle.

**Les valeurs A0–A4 livrées ne reposent sur AUCUNE mesure.** Elles viennent du
brief rédigé avec ChatGPT, qui les annonce lui-même comme « valeurs provisoires »
et « hypothèses Amazing Lab, pas des données RUCO ». Ni facture, ni fiche
technique, ni essai d'atelier derrière : ce sont des ordres de grandeur posés
pour que le calcul tourne. Le panneau le dit à l'écran, et les niveaux sont
librement créables, renommables et supprimables — A0–A4 n'est qu'un départ.

**Les coefficients sont PARTAGÉS**, rangés dans `app_settings` sous la clé
`paint_coefficients` — pas dans le localStorage. Si quelqu'un les recalibre
après des essais, les chiffrages de toute l'équipe doivent en profiter : c'est
tout l'intérêt de les mesurer. Lecture pour tous, écriture admin, comme le reste
de cette table ; un test le garde. `normaliserComplexites()` fait retomber une
valeur absente ou aberrante sur celle d'origine — un réglage corrompu ne doit
pas casser un chiffrage. En revanche un jeu enregistré fait foi POUR SA LISTE
de niveaux : sans ça, un niveau supprimé réapparaîtrait au chargement suivant
et on ne pourrait jamais s'écarter de A0–A4.

`lib/paintCalc.js` ne renvoie jamais de valeur inventée : ce qui n'est pas
calculable vaut `null` et sort avec un avertissement. Le `total` reste `null`
tant que la matière n'est pas chiffrable — afficher le seul coût du temps
donnerait une fausse impression de chiffrage complet.

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

## Prospection (`/prospects`)

Base **séparée** de `contacts`, et non un drapeau dessus. Un prospect n'a ni
facture ni projet, et ce qu'on veut savoir de lui — par quel canal on l'a
touché, quand le relancer, d'où il vient — n'a rien à voir avec un client. Un
drapeau aurait traîné les colonnes de facturation vides dans tous les écrans de
démarchage, et inversement.

Trois tables (`schema-prospects.sql`, jouée) : `prospects`, `prospect_people`,
`prospect_interactions`. Le calcul vit dans `lib/prospects.js`.

**La relance vit sur l'ÉCHANGE, pas sur la fiche.** « Appelé le 3, je rappelle
le 17 » : la prochaine relance d'un prospect est la plus proche non honorée. Un
champ posé sur la fiche est un champ qu'on oublie de mettre à jour ; une ligne
de journal, non — et elle garde la trace des relances déjà faites. Entre deux
retards, c'est le plus ANCIEN qui remonte : deux relances en retard ne se
traitent pas en parallèle.

**Le canal appartient à l'échange**, pas au prospect : on appelle, puis on
relance par mail. C'est aussi ce qui finit par dire ce qui marche.

**Pas d'étape « offre envoyée »** : le démarchage se fait avec une présentation.
L'offre vient après, quand le prospect est devenu client et a un projet — elle
vit alors dans la fiche projet.

**La conversion ne détruit rien.** Elle crée la société dans `contacts`, y
recopie les personnes, et sort le prospect des listes — mais sa ligne survit
avec `converted_to_contact_id`. C'est ce lien qui garde l'historique du
démarchage, et ce que la fiche cliente relit via `?converted_to=`. Supprimer un
prospect converti est refusé pour cette raison. L'opération n'est PAS atomique,
faute de fonction PostgreSQL dédiée : l'ordre des écritures est choisi pour
qu'un échec laisse un état rattrapable, et le message le dit.

**Les listes fermées sont doublées d'un `CHECK` en base.** Étapes, canaux et
sources sont contraints des deux côtés — c'est une divergence de vocabulaire
entre code et base qui avait rendu les factures clientes irrapprochables
pendant des mois (cf. `loadCandidates`).

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

**Un seul format de PDF, pour l'offre comme pour la facture.** Ce qui apparaît
se règle ligne par ligne (`hidden`), plus par un couple détaillé/résumé. La
colonne `customer_invoices.detail_level` subsiste en base mais n'est plus lue.

**Le second rendu du bulletin QR n'attend pas le réseau.** `qrDocument()` ne
contient qu'un SVG inliné : `waitUntil: 'domcontentloaded'` suffit. Avec
`networkidle0`, la génération d'une facture passait de 2 à 8,5 secondes — pour
attendre des ressources qui n'existent pas.

**Les marges d'un document PDF viennent de `@page`, jamais d'un `padding`.**
Un padding ne s'applique qu'au début et à la fin du bloc : à partir de la
page 2, le texte touchait le bord du papier. Corollaire : le bulletin QR d'une
facture est un DOCUMENT SÉPARÉ (`qrDocument`), rendu avec ses propres marges
puis concaténé par `htmlToPdf(html, annexe)`. Les pages CSS nommées
(`@page bulletin { margin: 0 }`) auraient évité ça, mais Chrome ne les honore
pas — vérifié, il insère une page blanche.

**La date du jour a une source unique** (`lib/aujourdhui.js`), et les échéances
se comparent en chaînes `YYYY-MM-DD`. `new Date('2026-09-04') < new Date()`
compare un instant UTC à l'heure locale : en Suisse d'été, minuit UTC du jour
d'échéance tombe à 02h00 locales, et la facture était déclarée en retard le jour
même où elle est due. Le défaut a vécu des mois dans `factures-emises`, alors
que `supplierStatus` comparait déjà des chaînes avec le commentaire qui
l'explique — c'est la duplication du calcul qui les avait fait diverger.

**Les montants ne passent pas par `Intl`** (`lib/money.js`). Le séparateur de
milliers de `fr-CH` dépend de la version d'ICU embarquée dans Node : la CI et
le poste de développement ne produisaient pas le même texte, et surtout, le
séparateur imprimé sur une facture dépendait de la version que Vercel
exécutait ce jour-là. L'apostrophe suisse est écrite explicitement.

**Le cache SWR vit dans le `sessionStorage`, jamais le `localStorage`.** Il a
été persisté dans le localStorage : factures, données bancaires, contacts et
marges y survivaient à la déconnexion, sur des postes partagés. Il a ensuite été
passé en mémoire seule — ce qui a rendu chaque rechargement lent, l'écran
attendant le réseau avant d'afficher quoi que ce soit. Le sessionStorage tient
les deux bouts : propre à l'onglet, effacé à sa fermeture, et purgé à la
déconnexion. Une entrée de plus de 512 Ko n'est pas persistée, pour qu'une
grosse réponse ne remplisse pas le quota à elle seule.

**Les listes de projets se chargent avec `?light=1`.** `quote_data` pèse 60 %
de `/api/projects` et porte les prix d'achat et les marges, alors que les listes
n'en affichent qu'un mot — et la barre latérale charge cette route sur CHAQUE
page. Le paramètre ne laisse que `quote_data.status`, sans changer le format.
`/offres` et les pages de facture gardent la réponse entière : elles recalculent
les totaux.

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
| `schema-work-slots.sql` | table `work_slots` (planning par demi-journée) | `DROP TABLE work_slots;` |
| `schema-bank-classification.sql` | `bank_transactions.classification` + comptes par défaut (salaires, virements internes) | en fin de fichier |

`schema-prospects.sql` (les trois tables de prospection) a été jouée le
4 septembre 2026 et vérifiée par `check:db`.

**Toute migration ajoutée ici doit aussi recevoir une sonde dans
`scripts/check-db.mjs`.** `schema-work-slots.sql` est resté six semaines hors
des deux listes : `/planning` renvoyait 500 en production et `check:db`
annonçait « base à jour ». Une migration qu'aucune sonde ne couvre est une
migration qu'on oubliera.

`schema-integrite-financiere.sql` commence par deux requêtes de contrôle à
passer d'abord : les index uniques échouent si des doublons existent déjà.

`schema-security-lockdown.sql` reste à exécuter **en dernier** si l'ensemble est
rejoué depuis zéro.

---

## Contrôles automatiques

```bash
npm run lint            # ESLint, `no-undef` seul — BLOQUANT en CI
npm test                # tests unitaires, dont l'inventaire et la matrice d'autorisation
npm run check:secrets   # balaie les fichiers suivis par git (tourne en CI)
npm run check:db        # vérifie que les migrations attendues sont en base
```

`eslint.config.mjs` est volontairement MINIMAL : une seule règle, `no-undef`.
Elle n'est pas là pour le style mais pour l'IDENTIFIANT LIBRE, que ni le build
ni les tests ne voient. Deux ont été livrés en production : `level` dans
`pages/api/send-document.js` (l'envoi d'offre par e-mail échouait sur
« Génération du PDF impossible »), et `logErreur` / `requestId` dans
`pages/api/bank/import.js` (le chemin d'erreur de l'import CAMT aurait planté
au moment précis où il servait). Next compile sans broncher dans les deux cas.

Le jeu de règles reste court POUR que le lint puisse être bloquant sans
chantier de remise à niveau. Ajouter des règles de style les rendrait
bloquantes elles aussi : à faire après avoir nettoyé ce qu'elles signalent.
Le greffon `react-hooks` est déclaré mais ses règles sont éteintes — sans lui,
les `eslint-disable-next-line react-hooks/exhaustive-deps` déjà présents
désignent une règle inconnue, ce qu'ESLint compte comme une erreur.

**Le banc d'essai des routes n'applique AUCUNE contrainte de base.**
`tests/helpers/routeHarness.js` simule Supabase : un `NULL` dans une colonne
`NOT NULL` y passe sans bruit. Six tests du catalogue étaient verts pendant que
la production renvoyait « Erreur interne » sur un `catalog_items.name` à `null`.
Un test de route valide le code de la route, pas ce que la base en fera — quand
une colonne a une contrainte, vérifier ce qui PART vers la base.

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

La CI (`.github/workflows/ci.yml`) exécute lint, tests, build, audit des
dépendances (bloquant sur « critical » seulement) et détection de secrets.
Le lint passe en premier : c'est le contrôle le plus rapide. Elle n'a accès
ni à la base ni aux secrets de production.
