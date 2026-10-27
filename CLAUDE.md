# Maze Project — Contexte projet

Application de gestion de projets, horaires et frais pour Amazing Lab (atelier de fabrication).
URL production : https://mazeproject.amazinglab.ch

---

## Stack

- **Next.js 15** — Pages Router (pas App Router), JavaScript (pas TypeScript)
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
  _document.js         — Squelette HTML : `lang="fr"` et les balises PWA, rendues par le
                         SERVEUR quel que soit l'état de la session (voir « Sur iPhone »)
  login.js             — Connexion
  index.js             — Projets : cartes / kanban / gantt / liste (page principale)
  home.js              — Dashboard accueil + Google Agenda
  schedule.js          — Horaires et congés : présence, solde, jours fériés
                         (page principale des non-admins)
  frais.js             — Mes notes de frais : photo du ticket, scan, dépôt (section dédiée)
  heures.js            — Heures imputées : projet × activité, jour par jour ; export et
                         activités pour l'admin (section dédiée)
  tasks.js             — Tâches, toutes catégories
  agenda.js            — Agenda par demi-journée, toute l'équipe (section dédiée)
  planning.js          — Charge de l'atelier : la jauge (section dédiée)
  meeting.js           — Vue réunion
  activity.js          — Journal d'activité
  e/[jeton].js         — Vue rapide d'un article d'économat, après scan du QR de sa
                         carte (sans chrome, connexion exigée — section dédiée)
  display.js           — Affichage mural (route publique, sans chrome ; lit
                         /api/display-projects, DTO réduit — voir Sécurité)
  settings.js          — Paramètres utilisateur
  outils/index.js      — Index des outils d'atelier
  outils/peintures.js  — Peintures RUCO : sélecteur + chiffrage (section dédiée)
  outils/annuaire.js   — Annuaire : qui fait quoi, où l'on commande (section dédiée)
  outils/economat.js   — Économat : les consommables de l'atelier (section dédiée)
  outils/charges-sociales.js — (admin) Ce qu'un employé coûte : AVS/AC/AF, LAA, LPP
  outils/assurances.js — (admin) Ce qu'on a choisi d'assurer, et ce qui est couvert
  outils/impression-3d.js — Prix d'une impression 3D depuis les fichiers STL/3MF (section dédiée)
  outils/marge-km.js   — (admin) Marge au km : un trajet gagne-t-il de l'argent ?
                         simulation sur les réglages Transport, sans les modifier
  peintures.js         — Redirection vers /outils/peintures (anciens signets)
  clients.js           — Annuaire des SOCIÉTÉS (lignes) + personnes sans société
  clients/[id].js      — Fiche société ou personne ; affiche le journal de
                         démarchage si la société vient d'un prospect converti
  prospects.js         — (admin) Prospection : liste triée par relance due
  prospects/[id].js    — (admin) Fiche prospect : journal, relances, conversion
  catalog.js           — Catalogue d'articles et d'heures
  projects/[id].js     — Fiche projet : tâches, logistique, fichiers ; visite, offre,
                         présentation et rentabilité rangées en tuiles (une ouverte à la fois)
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
    heures/            — Heures imputées : liste, création, correction, export (admin)
    economat/          — Économat : catalogue, états, fiche scannée, cartes PDF
    activites.js       — Activités d'imputation : lecture pour tous, écriture admin
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
  ActivitePicker.js      — « + Activité » dans l'offre, et le code d'une ligne existante
  PillsFiltre.js         — Rangée de pastilles de filtre, avec les comptes
                           (projets, offres, factures — même geste, un seul bouton)
  DossierUI.js · QuestionCouverture.js — Briques des deux écrans d'assurances

lib/
  supabase.js · supabase-server.js — Clients Supabase (navigateur / service-role)
  requireAdmin.js        — JWT (requireUser, requireAdmin, requireCronOrAdmin, cache 5 min)
  taskAccess.js          — Visibilité des tâches privées (appliquée côté serveur)
  invoiceCheck.js        — Validation et recalcul serveur des montants de facture
  fetchTimeout.js        — fetch avec délai maximal, pour tous les appels sortants
  apiError.js            — Réponses d'erreur normalisées + journalisation nettoyée
  api.js                 — Client API : res.ok, erreurs typées, annulation
  projectHelpers.js      — Calculs et formatage de la fiche projet ; recherche libre
                           dans la liste (`chercherProjets`)
  textSearch.js          — Correspondance par DÉBUT DE MOT, tous les mots exigés.
                           Requête et champs se découpent PAREIL — sur la
                           ponctuation — sinon « BC-4471 » ne trouve pas « BC-4471 »
  paintPrices.js         — Tarif RUCO d'atelier (20 produits, prix facturés)
  paintCalc.js           — Chiffrage peinture : quantités, coût matière, temps
  annuaire.js            — Annuaire : validation, arbre par technique, recherche
  economat.js            — Économat : états, lien fournisseur, arbre, filtres, planches
  economatCarte.js       — La carte A6 et la planche A4 PAYSAGE (quatre par feuille)
  assurances.js · assurancesCalc.js — Contrats, couvertures, coût par personne
  impression3d.js        — Impression 3D : poids, temps, plateaux, prix, calibration
  maillage3d.js          — Lecture STL/3MF, séparation en corps, volume, surface, empreinte
  fileType.js            — Type réel d'un fichier déposé + en-têtes de réponse
  kdriveAccess.js · signedRef.js — Autorisation d'accès aux fichiers kDrive
  useIsAdmin.js · useIsMobile.js · useResponsibles.js · useSuggestions.js — Hooks
  swr.js                 — Cache SWR persisté en sessionStorage (voir /peintures)
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
  heures.js              — Heures imputées : validation, recouvrements, totaux, export CSV
  rentabilite.js         — Prévu (offre, au prix de revient) contre réel (coûts saisis, heures)
  joursOuvres.js         — Décompte de l'écran d'atelier en jours travaillés (lun, mar, jeu, ven)
  modelesClaude.js       — Identifiants des modèles Claude, en un seul endroit
  aujourdhui.js          — Date du jour en YYYY-MM-DD (source unique, voir plus bas)
  suiteConnexion.js      — Où renvoyer après connexion (`?suite=`) ; refuse tout ce
                           qui sortirait de Maze — redirection ouverte
  todoist.js · googleCalendar.js · push-server.js · adminFetch.js

tests/                   — Vitest (npm test) : calculs, parsing, nommage, autorisations
scripts/                 — Scripts ponctuels et contrôles :
                           check-secrets.mjs (CI), check-db.mjs (état des migrations)
*.sql                    — Migrations, à exécuter dans l'éditeur SQL Supabase
public/icons/            — Icônes de l'app installée, produites par scripts/icones-pwa.mjs
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
GROQ_API_KEY               dictée et transcription des vocaux (Whisper, palier gratuit)
                           facultative : sans elle, la dictée renvoie 503 et l'écran
                           renvoie à la dictée du système, qui écrit dans le champ
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
const KNOWN_USERS = ['Arnaud', 'Guillaume']
```

**Les droits viennent de `profiles.role`**, pas d'un nom écrit dans le code.
Au 17 septembre 2026 : Guillaume et Arnaud, tous deux `admin`. Gabin a quitté
l'entreprise le 31 octobre 2026 ; son compte, son profil et sa place dans la
liste des responsables ont été supprimés le 17 septembre — il ne s'était jamais
connecté. Ce qui porte encore son nom (9 tâches, 2 projets archivés) est de
l'HISTOIRE et reste tel quel : réécrire qui a fait quoi serait un mensonge, et
`personChip` rend proprement un nom qui n'est plus dans la liste.
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

**Ne pas charger ce JSON via SWR.** Le cache SWR est persisté en sessionStorage
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

### Annuaire (`/outils/annuaire`)

« Le thermolaquage, on le fait faire chez qui, déjà ? » La réponse vivait dans
d'anciennes factures et dans la tête d'Arnaud.

**Base séparée de `contacts`, et non un drapeau dessus** — même arbitrage que
pour les prospects. Les 113 contacts marqués « fournisseur » sont des
contreparties COMPTABLES (AVS, fiduciaire, ECA, transporteur, agence
d'intérim) : un annuaire de savoir-faire noyé là-dedans ne se consulterait pas.
Inversement, une entrée d'annuaire n'a ni numéro de TVA, ni adresse de
facturation, ni facture.

**On range par TECHNIQUE, jamais par région.** Deux niveaux à l'écran, aucune
profondeur imposée en base. Une entrée peut tenir dans plusieurs catégories —
un tôlier qui fait aussi le thermolaquage se retrouve depuis les deux — d'où la
table de liaison. Choisir une catégorie inclut ses SOUS-catégories : demander
« CNC » sort aussi les fournisseurs de fraises rangés dessous, sinon une mère
afficherait zéro alors que tout est classé dessous.

**Une entrée peut n'être qu'un nom.** Tout le reste est facultatif, et
« ruco.ch » suffit comme site — le préfixe est posé par `normaliserSite`. Un
lien noté à la volée vaut mieux qu'une fiche complète jamais saisie.

**La recherche porte aussi sur le nom des catégories** : taper
« thermolaquage » sort l'atelier rangé dessous même si le mot n'apparaît pas
dans sa fiche. Accents et casse ignorés, et TOUS les mots exigés.

**Lecture et écriture pour tout membre** : celui qui trouve un bon tôlier doit
pouvoir l'inscrire sans demander à l'admin. Supprimer une catégorie emporte ses
sous-catégories et les rattachements, jamais les entrées — elles se retrouvent
sans catégorie, pas à la corbeille.

### Économat (`/outils/economat`, `/e/<jeton>`)

Les consommables de l'atelier : vis, abrasifs, adhésifs, EPI, filtres. Ce
n'est **pas une gestion de stock**. Aucune quantité n'est décrémentée, aucun
seuil n'est comparé à rien, et Maze ne décide jamais d'un état — c'est un
humain devant une boîte qui bascule 🟢 → 🟠 → 🔴 → 🔵 → 🟢. Le **Kanban
physique reste l'outil** ; Maze centralise les références, dit ce qu'il y a à
commander, garde l'historique et imprime les cartes.

**Toutes les transitions sont libres.** Le `CHECK` porte sur la VALEUR de
`etat`, jamais sur le chemin : 🟠 → 🔵 est une commande anticipée, un retour
en arrière est une correction. Il n'y a pas d'état « Reçu » — à réception,
l'article repasse en 🟢 et la ligne de commande se ferme toute seule
(`recu_le`). Les états sont des clés courtes (`ok`, `bas`, `commander`,
`commande`) : **jamais d'emoji en base**, ça ne se cherche pas, ne se trie pas
et casse le premier export.

**Tous les seuils sont du TEXTE.** « Si inférieur à 100pce », « ½ rouleau »,
« ~20 % restant », « dernier paquet ». Un seuil numérique inviterait à
comparer, donc à automatiser — et l'automatisation ment dès la première boîte
à moitié vide. Seul `delai_jours`, facultatif, est un nombre : il ne sert
qu'à signaler un 🔵 qui traîne, et sans lui on ne signale RIEN plutôt que
d'inventer un délai par défaut.

**Un seul geste écrit l'état** (`/api/economat/etat`), parce qu'il ouvre et
ferme aussi le journal des commandes. Laisser le PUT du catalogue écrire
`etat` en passant produirait des états sans historique, découverts le jour où
l'on cherche « on l'a commandé quand, déjà ? ». Le journal **recopie**
fournisseur, référence et quantité : même raison que le forfait transport qui
fige sa distance — changer de fournisseur ne doit pas réécrire le passé.

**Une seule clé vers la catégorie**, qui pointe la sous-catégorie ou la
racine, et `ON DELETE SET NULL` — à l'inverse du catalogue, qui casse en
cascade. Ranger la taxonomie ne doit jamais effacer un article : c'est un
objet physique dans une boîte, il se retrouve « sans catégorie », pas à la
corbeille. La **couleur ne vit qu'au premier niveau**, la sous-catégorie
hérite : cinquante teintes seraient cinquante teintes indiscernables sur le
bandeau d'une carte, et ce bandeau ne répond qu'à « ça se range où ». Les
douze catégories et leurs quarante-trois filles sont **semées par la
migration**, jamais codées en dur.

**Le fournisseur est une liste contrôlée** (`economat_fournisseurs`), pas du
texte libre sur l'article. C'est un FILTRE métier — « montre-moi ce qui est 🟠
et 🔴 chez OPO pendant leur promo » — et une colonne libre produit « OPO »,
« opo » et « OPO Oeschger » côte à côte au bout de six mois ; c'est exactement
la divergence de vocabulaire qui avait rendu les factures clientes
irrapprochables. Un fournisseur s'ajoute depuis la fiche article, sans détour
par un écran d'administration. Il s'ARCHIVE, ne se supprime pas, et le filtre
continue de proposer un archivé encore utilisé — sinon les articles qu'on lui
achète disparaîtraient avec lui. `annuaire_id` est nullable et sans usage en
V1 : l'annuaire ne porte aucun de ces quatre fournisseurs, et exiger une fiche
d'annuaire avant de commander des vis serait absurde. **Le journal des
commandes recopie le NOM**, pas la clé : une ligne d'historique doit rester
lisible si le fournisseur est renommé — c'est une photographie, pas une
jointure.

**L'emplacement reste du texte libre en V1**, parce que la nomenclature
physique de l'atelier n'existe pas encore : imposer une liste avant d'avoir
posé les étiquettes sur les rayonnages garantirait des « divers » partout. Le
passage en liste contrôlée se fera comme pour les fournisseurs — une table,
une colonne `emplacement_id`, un script qui reprend les valeurs distinctes —
sans toucher au reste du module.

**Le bouton « Commander » se fabrique depuis la référence chez OPO.**
Vérifié en direct : `https://www.opo.ch/fr/s?searchfield=<référence>`
redirige sur la fiche produit. Les 64 articles OPO n'ont donc aucune URL à
saisir, et une référence fausse tombe sur « 0 résultats » — ce qui en fait
aussi le vérificateur des références. OPO n'offre ni API, ni punchout OCI,
ni flux catalogue publics : mettre au panier depuis Maze serait du scraping
authentifié, et c'est hors périmètre — l'import CSV d'une liste de commande
est à leur demander, mais ne bloque pas la V1. **L'URL saisie à la main gagne
toujours** sur le lien déduit : une décision humaine passe avant une
déduction, et c'est la soupape le jour où la structure d'opo.ch bouge ou
qu'une fiche ne sort pas de leur recherche.

**Le QR mène à `/e/<jeton>`, et l'adresse est courte exprès.** Elle est
encodée dans un QR imprimé à 20 mm : `/outils/economat/article/<jeton>` ferait
soixante-dix signes et obligerait à grossir le QR sur une carte déjà chargée.
C'est un **jeton**, pas l'id — un QR sur `/e/42` s'énumère depuis le parking.
La page **exige une session** comme toutes les autres : Maze n'a qu'une route
publique (`display-projects`), et `tests/rbac.test.js` est construit pour
rendre l'ajout d'une seconde délibéré. Si l'authentification se révèle trop
pénible à l'usage, le repli décidé est lecture publique / écriture connectée —
pas d'écriture publique. `_app.js` garde donc la destination
(`/login?suite=…`, chemin interne seulement) : sans ça, un scan atterrissait
sur l'accueil et il fallait rescanner, le téléphone déjà à la main. Ouvrir
« Commander » ne change pas l'état — on consulte souvent une fiche sans rien
commander.

**La planche de cartes est un A4 PAYSAGE.** A6 paysage = 148 × 105 mm ;
2 × 148,5 = 297 et 2 × 105 = 210. Quatre cartes tombent pile sur un A4 couché,
et sur aucun A4 debout. Repères de coupe en traits courts aux bords, pas un
cadre : une coupe de travers laisse alors du blanc, pas un demi-cadre. L'état
courant et le stock cible ne sont **pas imprimés** — ils changent, la carte
non. `depart` laisse des cases vides en tête de planche pour réimprimer une
carte perdue sans gâcher une feuille. `/api/economat/cartes` doit rester dans
`outputFileTracingIncludes` avec Chromium ET `public/fonts`, et se rend en
`attendre: 'load'` : les photos sont des URL distantes, et une carte sans sa
photo s'imprimerait sans erreur — le défaut ne se verrait qu'au massicot.

**Les photos vont dans un bucket PUBLIC** (`economat-photos`), pas sur kDrive.
La même image doit s'afficher dans une page ouverte au téléphone après un scan
ET dans un PDF rendu par Chromium, qui n'a aucun jeton kDrive — c'est ce qui a
obligé la présentation client à tout passer en base64. Contrepartie assumée :
qui possède l'URL voit la photo d'une boîte de vis ; le chemin est aléatoire,
jamais devinable depuis le code article. Le navigateur réduit à 1200 px avant
l'envoi (le corps d'une requête est plafonné à 4,5 Mo sur Vercel, tous plans
confondus). La photo s'ajoute depuis la FICHE ARTICLE, jamais depuis la vue
scannée : celle-ci est réservée aux gestes rapides, et prendre une photo y
ajouterait une seconde action là où le budget est « scan + une ».

**Le code ECO-0001 est définitif**, attribué par une séquence Postgres comme
`projects.numero`, jamais réattribué — même règle que le code d'une activité :
une carte imprimée aujourd'hui doit vouloir dire la même chose dans deux ans.
Un article se RANGE (`archived`), il ne se jette pas ; la suppression
définitive est réservée à l'admin et emporte le journal des commandes.

**L'import des 84 articles est un script, pas un écran**
(`scripts/import-economat.mjs <csv> [--ecrire]`). Une seule fois, sur
quatre-vingts lignes, avec un arbitrage humain sur une vingtaine : un import
générique coûterait plus cher que la donnée. Sans `--ecrire` il ne produit
qu'un **rapport**, parce que le brief prévient que « des désignations ou
photos proches ne signifient pas nécessairement qu'il s'agit de doublons ».
Les colonnes d'audit du classeur (`A_completer`, `Controle_reference`,
`Doublon_reference`, `Source_Numbers`…) ne deviennent pas des colonnes : elles
alimentent ce rapport et s'arrêtent là. Quatre vrais doublons sont fusionnés ; trois
lignes de colliers partagent une référence pour des dimensions différentes et
**ne sont PAS importées** — deux produits différents ne peuvent pas porter la
même référence puisque la référence fait foi, et les importer en se promettant
de corriger plus tard, c'est imprimer deux cartes qui mènent au même produit
et découvrir l'erreur une boîte à la main. Elles restent dans le fichier de
préparation et reviennent au prochain passage. Un fournisseur absent de la
liste contrôlée est créé, mais ANNONCÉ : c'est plus souvent une coquille
qu'une nouvelle maison. Rejouer le
script met à jour sans dupliquer et **ne touche ni `etat`, ni `jeton`, ni
l'historique** — un rejeu ne doit pas remettre tout le stock au vert.

### Impression 3D (`/outils/impression-3d`)

On dépose des fichiers STL ou 3MF ; la page donne le prix à facturer, par
pièce et par poste. Spécification d'origine : « Calculateur de prix
d'impression 3D », octobre 2026, calibrée sur un vrai job (122 pièces origami
pour une vitrine, temps réels de Bambu Studio sur X1C).

**Tout se passe dans le navigateur, aucun fichier n'est envoyé.** Pas de
route, pas de table. `lib/maillage3d.js` lit les fichiers et mesure,
`lib/impression3d.js` chiffre ; la page n'affiche. Le 3MF se dézippe par
`DecompressionStream` (Node le fournit aussi, d'où des tests sans navigateur),
et l'aperçu est un rendu canvas 2D maison : pas de three.js ni de bibliothèque
zip pour une vignette et une archive.

**Un fichier n'est pas une pièce.** Chaque fichier est séparé en corps
disjoints (composantes connexes, sommets soudés au micron), et chaque corps
devient une référence `<fichier> #1`, `#2`… triée sur X. Sont écartés, et
listés à l'écran : les corps sous 1 cm³ ou de volume nul, et les triangles en
double. **Les doublons sont retirés AVANT la séparation** : deux copies
superposées d'un 3MF Bambu partagent tous leurs sommets, et se soudaient en
une seule pièce de volume double — facturée deux fois sa matière. Dans un 3MF,
les éléments posés qui renvoient au même objet, ou des objets de forme
identique, s'additionnent en QUANTITÉ ; dans un STL, chaque corps reste une
référence.

**Ce qui vient du slicer remplace l'estimation, et l'écran le dit** (« estimé »
/ « slicer » sous chaque valeur). Le modèle de temps (`a × g + b`) est calibré
sur des pièces décoratives creuses : pour une pièce pleine ou technique, le
temps du slicer fait foi.

**Le brim ne compte que pour une pièce ÉLANCÉE** (hauteur / empreinte > 4,
celle à qui l'alerte le recommande). La spec l'ajoutait à toutes : un socle de
96 mm occupait 120 mm et se retrouvait seul sur un plateau de 232, vingt socles
faisaient vingt plateaux. Décidé le 26 octobre 2026. Le nombre de plateaux
reste forçable à la main.

**La calibration est PARTAGÉE** (`app_settings.impression3d_reglages` : k_cal,
a, b, et densité, prix, facteur temps et ratés par matière). Même arbitrage
que les coefficients de peinture : un plateau mesuré par l'un doit corriger
les devis de tous. Lecture pour tous, écriture admin ; un membre peut modifier
pour son devis sans enregistrer. `normaliserReglages()` fait retomber une
valeur absente ou aberrante sur celle d'origine. L'écran « Calibrer » refait
la régression `temps = a × g + b × n` sur des plateaux réels ; sur les quatre
plateaux de la spec, il redonne a = 0,0174 et b = 0,260. **Les prix au kg sont
des valeurs de départ**, à remplacer par les prix d'achat réels.

**Les prix sont arrondis au 0,05 par pièce**, et le total HT est la somme des
lignes arrondies. Le récapitulatif par poste n'est pas arrondi : la différence
est affichée sur une ligne « Arrondis », pour que les deux tableaux bouclent.
La manutention par pièce pèse ~60 % du total sur une série de petites pièces :
c'est le levier principal, et l'écran le met en avant.

### Charges sociales et Assurances (`/outils/charges-sociales`, `/outils/assurances`) — admin

Deux écrans, un seul jeu de données. `charges-sociales` porte ce que l'État et
la prévoyance obligatoire prélèvent sur les salaires (AVS/AC/AF, LAA, LPP) :
« combien coûte un employé ». `assurances` porte ce qu'on a choisi d'assurer
(IJM, RC, biens, véhicules, protection juridique) : « suis-je couvert ».
`famille` sur chaque contrat de `lib/assurances.js` fait le partage.

L'IJM est à cheval — assurance de personnes, mais assise sur les salaires. Elle
est du côté ASSURANCE parce qu'elle se résilie, là où l'AVS et la LAA s'imposent.

La boîte à questions (`components/QuestionCouverture.js`) est montée sur les
deux pages et cherche dans TOUTES les garanties, jamais seulement celles de
l'écran courant : « un gars s'est blessé à l'atelier » relève de la LAA, et
personne ne se demande dans quel écran poser la question. Le découpage range
les COÛTS, il ne cloisonne pas les réponses.

L'écran lui-même est assemblé à partir de `components/DossierUI.js` (bandeau,
cartes de contrat, d'obligation et de manque) : les deux pages sont jumelles,
et cent cinquante lignes recopiées auraient divergé au premier ajustement.

**Aucune base de données.** Tout vient de `lib/assurances.js`, écrit à la main
sur le dossier kDrive `Common documents/amazing files/00. Admin/Assurances`
(92 pièces). Une dizaine de contrats qui bougent une fois par an ne valent pas
une table, une migration et un écran d'administration ; et un fichier versionné
laisse voir dans `git log` quand une garantie a changé — ce qu'une ligne de base
ne dit pas. Pour mettre à jour : modifier l'objet, pousser l'ancien contrat en
`statut: 'caduc'` s'il est remplacé, citer le nouveau fichier dans `source`.

**Trois règles reprises de `paintPrices.js`, à ne pas défaire :**

1. Une valeur inconnue vaut `null`, jamais 0. Une part employeur qu'aucune pièce
   ne fixe reste `null` et l'écran écrit « au moins ». Il serait facile de poser
   `partEmployeur ?? 0.5` — c'est l'usage, et la loi impose au moins la moitié
   pour l'IJM — mais l'écran servirait alors des francs inventés à côté de francs
   relevés sur facture, sans rien pour les distinguer. Un test le garde.
2. `couvert: 'verifier'` n'est pas un défaut de saisie, c'est une réponse. Le
   dossier ne contient AUCUNE des Conditions Générales citées par les polices, et
   les exclusions vivent là.
3. Les contrats caducs restent dans la liste. Savoir qui couvrait quoi en 2023
   est la première question quand un sinistre ancien ressort.

**La boîte à questions n'appelle pas le modèle**, elle cherche par mots-clés
dans `COUVERTURES` (`lib/assurancesCalc.js`). Une réponse d'assurance doit être
vérifiable : chaque réponse pointe une garantie, qui pointe une police, qui
pointe un fichier. Un modèle produirait de plus jolies phrases et, un jour, une
exclusion inventée — sur un sujet où l'erreur se découvre au sinistre. En prime,
ce moteur répond quand le crédit d'API est à sec.

**Prime facturée et prime calculée sont deux nombres, et on garde les deux.** La
Suva facture 2026 sur une masse provisoire de 195 000 alors que les salaires
déclarés valent 166 800 : l'écart n'est pas une erreur de calcul, c'est une
régularisation à venir. `ecartFactureCalcule()` l'affiche. Le plafond LAA est
individuel — il écrête chaque salaire — mais le taux s'applique ensuite à la
masse, comme sur la facture.

---

## Sur iPhone — l'application installée

Maze s'installe sur l'écran d'accueil (PWA). Pas de Capacitor : `ios/` reste
échafaudé mais `capacitor.config.json` pointe `server.url` sur la production,
donc l'app native chargerait EXACTEMENT le même site dans un WebView. On
paierait les certificats et une resoumission TestFlight tous les 90 jours pour
afficher ce qu'un raccourci d'écran d'accueil affiche déjà. À deux, ça ne vaut
pas le prix — et sur iOS 16.4+, les notifications push marchent depuis une PWA
installée. L'échafaudage reste en place pour le jour où l'équipe grandit.

**L'icône vient du LOGO, pas d'un fichier déposé à la main.**
`node scripts/icones-pwa.mjs` la produit depuis `lib/amazingLogo.js`, celui de
l'écran de chargement. Il y avait trois dessins pour la même marque — le vrai
logo, plus un « atome » inventé au rose de juillet dans `icon.svg` ET dans
`favicon.svg`. Trois façons de diverger.

Trois contraintes d'iOS qu'aucun outil ne rappelle, et qui expliquent le
script :

1. **`apple-touch-icon` doit être un PNG.** iOS ne lit pas le SVG et fabrique à
   la place une capture de la page — c'est ce qui se passait, et l'icône sur
   l'écran d'accueil n'était donc pas la bonne.
2. **La transparence devient noire.** Le fond est peint, et il l'est avec le
   noir de la marque.
3. **iOS arrondit les angles lui-même.** Un rayon dessiné dans l'image
   donnerait un double arrondi.

**Le noir du manifeste est celui de l'écran de chargement** (`#0C0C0C`).
L'écran de lancement d'iOS et le nôtre s'enchaînent alors sans clignotement
blanc entre les deux. `background_color` et `theme_color` étaient restés à la
palette de juillet (`#fafafa` / `#111827`).

**`apple-mobile-web-app-status-bar-style` reste à `default`.** `black-translucent`
ferait passer le contenu SOUS l'heure et la batterie : il faudrait alors une
marge haute en `env(safe-area-inset-top)` sur chaque page, et seule la marge
BASSE est gérée aujourd'hui (`_app.js`, pour la barre de navigation).

**Les balises PWA sont rendues par le SERVEUR** (`pages/_document.js`). Elles
vivaient dans le `<Head>` de `_app.js`, placé APRÈS deux sorties anticipées —
l'écran de chargement tant que l'authentification n'a pas répondu, et le
`return null` d'une page protégée sans session. Au rendu serveur, `authReady`
vaut toujours false : le HTML servi ne contenait donc ni manifeste, ni
apple-touch-icon, ni `viewport-fit=cover`, seulement le viewport par défaut de
Next. Tout n'apparaissait qu'après hydratation. Le VIEWPORT, lui, reste dans
`_app.js` via `next/head` et est rendu dans les TROIS branches : Next en
injecte un par défaut dès qu'il n'en trouve pas là, et on se retrouvait sinon
avec deux balises viewport.

`lang="fr"` ne peut être posé QUE depuis `_document` — React ne touche pas aux
attributs de `<html>`. Il manquait : un lecteur d'écran lisait une interface
française avec une voix anglaise.

**La barre du bas est le SEUL accès sur mobile**, la sidebar ne s'affiche
qu'au-delà de 768 px. Elle portait sept entrées et rien d'autre : tout ce qui
n'y figurait pas était injoignable depuis un téléphone — heures, activité,
outils (donc l'économat et l'annuaire), contacts, catalogue, stockage, offres,
factures, banque, compta. Dix-huit pages. Elle porte maintenant QUATRE entrées
(accueil, projets, tâches, horaires) et un « plus » qui ouvre la MÊME liste que
la sidebar, **importée d'elle** (`MAIN_ITEMS`, `FIN_TOP`, `FIN_GROUPS`) et non
recopiée : deux listes de navigation divergent au premier ajout, et c'est
exactement comme ça que l'économat est né sans entrée mobile.

**`u-tactile` agrandit la ZONE sans agrandir le DESSIN** (`globals.css`). Un
pseudo-élément centré de 44 px capte le doigt ; l'élément garde sa taille et la
mise en page ne bouge pas. C'est la seule façon d'élargir une pastille de 17 px
sans refaire la ligne autour. Réservé au pointeur GROSSIER : à la souris, deux
zones de 44 px côte à côte se chevaucheraient et le clic partirait au mauvais
bouton. `u-pastille` grandit pour de vrai, là où la place existe.

**Une ligne qui ne tient pas PASSE À LA LIGNE, elle ne s'écrase pas.** La
liste des projets était une rangée fixe : badge, 120 px d'avancement, menu et
trois gouttières de 16 px faisaient 276 px de contenu fixe, et `main` gardait
40 px de marge de chaque côté. Sur 375 px, il restait DIX-NEUF pixels au nom du
projet — il disparaissait, le numéro se coupait en « 1. » et le client se
cassait mot par mot. Corrigé par un `flexWrap` et une base de 220 px sur le
nom : sur un écran large tout tient sur une ligne, exactement comme avant ;
au doigt, le nom prend la première ligne et le reste la seconde. Pas de seconde
mise en page à maintenir — c'est la règle à suivre pour les autres écrans.

**La colonne des libellés du gantt est COLLANTE** (`position: sticky`). La
frise fait 1425 px : elle défile sur un téléphone comme sur un portable de
13 pouces, et sans ça le nom du projet partait à −567 px — on lisait des barres
et des dates sans savoir à qui elles appartenaient. Le cale-libellé de
l'en-tête des mois l'est aussi, sinon les mois glissent dessous. La colonne
passe de 200 à 132 px au doigt : 200 px sur 375, c'est 58 % de la largeur pour
des noms déjà tronqués. Les vues CARTES et KANBAN n'ont rien demandé — la
première retombe sur une colonne par `minmax(300px, 1fr)`, la seconde défile
horizontalement, ce qui est le geste attendu d'un kanban.

**Les en-têtes de sécurité vivent dans `next.config.js`.** La production n'en
servait qu'un, le HSTS posé par Vercel. La CSP est écrite sur ce que
l'application charge RÉELLEMENT dans le navigateur — Maps, Google Identity,
gapi, Nominatim, Supabase — et vérifiée origine par origine en chargeant chaque
script sous la règle. Tout le reste (Anthropic, Groq, Resend, Todoist, kDrive,
Odoo) part des routes API, côté serveur : la CSP ne s'y applique pas, et les y
inscrire n'aurait fait qu'élargir la règle pour rien. `'unsafe-inline'` sur
`style-src` n'est pas un relâchement : toute l'interface est en styles inline,
c'est la seule façon d'écrire la règle. Caméra et micro restent autorisés dans
`Permissions-Policy` — la photo d'un justificatif et la dictée en dépendent.

**Le service worker ne fait QUE les notifications.** Il n'y a aucun cache : une
constante `CACHE_NAME` y traînait sans usage, et le commentaire promettait un
« cache PWA » qui n'a jamais existé. Le hors-ligne demande de décider quoi
servir périmé — et une offre périmée est pire que pas d'offre. Son icône de
notification pointait sur `/icon-192.png`, à la racine : ce fichier n'a jamais
existé, les push s'affichaient sans icône depuis toujours.

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

## Heures imputées (`/heures`)

Une heure imputée dit QUI, QUEL JOUR, DE QUAND À QUAND, SUR QUEL PROJET (ou
aucun) et POUR QUELLE ACTIVITÉ. La feuille manuscrite, son scan, la
rentabilité par projet et l'export vers l'outil financier reposent tous sur
cette ligne (`schema-heures.sql`, calcul dans `lib/heures.js`).

**Présence et imputation sont deux tables.** `work_entries` garde la présence
(arrivée, départ, pause) ; `heures`, ce sur quoi on a travaillé. Elles
répondent à « étais-je là ? » et « à quoi ai-je passé ce temps ? » ; les
confronter servira à repérer une journée à moitié imputée.

**Le numéro de projet n'est pas la référence.** `projects.reference` est celle
du CLIENT (son bon de commande, imprimé sur l'offre). `projects.numero` est le
nôtre : attribué par une séquence Postgres à la création (jamais de max + 1),
à partir de 100. Trois chiffres pour un projet, un ou deux pour une activité :
deux colonnes inversées sur une feuille manuscrite ne passent pas inaperçues.
Il n'est dans aucune liste blanche d'écriture — personne ne le choisit.

**Le code d'une activité est définitif.** Il ne se modifie pas, ne se supprime
pas et n'est jamais repris : une feuille scannée en 2026 doit vouloir dire la
même chose en 2028. Une activité qui ne sert plus se DÉSACTIVE ; ses anciennes
heures restent corrigibles (`tolererInactive`). La clé étrangère
`heures → activites` est sans cascade : la base refuse elle-même de changer le
code d'une activité utilisée.

**Les codes vont par dizaines de famille** : Gestion 10–19, Atelier 20–29,
Finitions 30–39, Chantier 40–49, Logistique 50–59, Interne 60–69. Renumérotés
une seule fois, le 11 septembre 2026, avant la première feuille imprimée
(`schema-activites-renumerotation.sql`). Une activité ajoutée prend le
prochain code libre de sa famille (`prochainCode`), pour qu'elle se range avec
les siennes. Le premier chiffre dit la famille — un contrôle de plus au scan.

**`minutes` est calculée par la base**, depuis `debut` et `fin` : elle ne peut
pas les contredire. `fin > debut` est une contrainte ; une nuit à cheval sur
minuit se saisit en deux lignes. Deux lignes d'une même personne ne se
recouvrent pas (contrôlé par la route, `chevauche()`), mais peuvent se toucher.

**L'identité vient du JWT.** Un membre n'écrit et ne lit que ses heures ; la
ligne d'un collègue lui répond 404. L'admin saisit pour les autres — c'est lui
qui reportera les feuilles scannées — et lui seul exporte : l'export est le
relevé d'activité de toute l'équipe.

**Chaque activité a un tarif de vente et un coût de revient à l'heure.** NULL
veut dire « pas renseigné », jamais zéro : une heure sur une activité sans coût
est signalée et écartée du calcul, pas comptée gratuite. Le coût de revient
n'est lu que par l'admin — `/api/activites` ne le SÉLECTIONNE pas pour un
membre, un filtre côté page ne protégerait rien. Renommer un libellé est permis ;
changer le SENS d'un code ne l'est pas, une nouvelle activité prend un nouveau
code.

**Toutes les activités ne se facturent pas à l'heure** (`facturee_heure`). La
conduite part au KILOMÈTRE, parfois au forfait pour les villes régulières :
facturer le temps de route, à deux ou trois, reviendrait trop cher au client.
L'interne ne se facture pas du tout. Ces heures restent un COÛT dans la marge
réelle, mais sortent de la comparaison « heures offertes / heures passées » —
les offres n'en prévoient jamais, et chaque chantier paraîtrait sinon hors
budget de tout son temps de route.

**Une journée travaillée est complétée, jamais inventée.** Journée régulière :
8,4 h payées, dont 30 min de pause OFFERTE ; la pause de midi (1 h) n'est pas
payée et n'y entre pas. Pour un jour de semaine où la personne a noté au moins
une ligne, ce qui manque devient « Divers » (63) et la pause non notée « Pause
payée » (64) — `complements()`. Le complément est CALCULÉ, jamais écrit en
base : il suit les lignes ajoutées après coup. Ni le jour en cours (la journée
n'est pas finie), ni un jour sans aucune ligne (oubli ou absence ? on ne sait
pas) ne sont complétés, et l'export filtré par PROJET n'en ajoute pas — une
journée partielle y fabriquerait un faux « Divers ». Les codes 63 et 64 sont
écrits en dur : c'est précisément ce que la règle « un code ne change jamais »
autorise.

**Le consulting se note contre un client et se compense dans une offre**
(`lib/consulting.js`). Une heure va à un projet OU à un client (`contact_id`,
contrainte en base), jamais aux deux. Seule l'activité 14 Consulting alimente
le solde d'un client ; la 13 Relation client ne se récupère pas. On la
compense par une ligne de Gestion MASQUÉE marquée `compensation: true` —
invisible sur le PDF, comprise dans le prix. Elle est CONSOMMÉE dès qu'elle
figure dans une offre, sauf offre refusée : la même heure ne sert pas deux
fois, et une offre refusée rend ses heures au solde. Le solde passe par la
FICHE du client (`client_contact_id`), jamais par son nom écrit. Dans la
rentabilité du projet qui la récupère, la compensation compte comme des
heures de consulting au coût de revient : sinon le chiffre qu'elle apporte
n'aurait aucun coût en face.

**La feuille d'heures imprimée est pensée pour le scan** (`lib/feuilleHeures.js`,
`/api/heures/feuille`). Une page A4 par personne et par jour TRAVAILLÉ (lun,
mar, jeu, ven), rangées jour par jour. Nom, date et code de feuille
(`H·AAAA-MM-JJ·NOM`) sont IMPRIMÉS : on ne lit pas une écriture pour savoir à
qui est la feuille. Horaires et numéros vont dans des CASES à un chiffre — 3
pour le projet, 2 pour l'activité, pour qu'une colonne inversée se voie. Les
projets en cours (hors pause) et les activités actives sont imprimés sur la
feuille. Un membre n'imprime que la sienne. La route est dans
`outputFileTracingIncludes` : sans elle, le binaire Chromium ne part pas avec
la fonction et le PDF tombe en production SEULEMENT. Un jour demandé SEUL sort
toujours (le mercredi ou le samedi exceptionnel), et `tous=1` imprime chaque
jour d'une période.

**La marge transport compare les km facturés au coût PAR VÉHICULE**
(`lib/transport.js`). Le coût d'un km se calcule véhicule par véhicule — entre
un Master en leasing (~1,24 CHF/km) et un Vito payé (~0,51), il varie du simple
au double —, et le véhicule se choisit sur la ligne km ou forfait de l'offre.
Une ligne sans véhicule est comptée au coût moyen de la flotte et SIGNALÉE. Un
forfait copie sa distance dans la ligne à l'insertion : changer un forfait ne
réécrit pas les offres faites. La marge transport retranche le véhicule ET le
temps de conduite (51) au coût de revient ; la marge réelle du projet compte
aussi les véhicules. Les coûts des véhicules sont une clé `app_settings`
lisible par l'ADMIN seul (`CLES_ADMIN`) ; les noms et forfaits, par tous.

**La rentabilité compare au prix de REVIENT** (`lib/rentabilite.js`, bloc admin
en bas de la fiche projet). Le prévu se lit sur l'offre AVANT marge et escompte
— prix d'achat × quantité, tarif de sous-traitance × quantité — parce que c'est
ce qu'on s'attendait à payer. Le réel vient de `project_couts` (saisi à la main,
HT, avoirs négatifs permis) et des heures imputées au projet. Les lignes masquées
de l'offre comptent. Une ligne de main-d'œuvre en jours ou sans unité n'est PAS
convertie en heures : elle est comptée à part et l'écran le dit. La marge en
francs attend un coût horaire de revient, qui n'existe pas encore.

**Une ligne de main-d'œuvre de l'offre porte son activité** (`activite`, le code
— même champ que les heures imputées et que la compensation de consulting).
C'est ce qui permet à la rentabilité de comparer MÉTIER PAR MÉTIER
(`heuresParActivite`) : un dépassement en peinture compensé par une avance en
assemblage donne un total juste, et n'apprend rien. « + Activité »
(`components/ActivitePicker.js`) remplit libellé, tarif et code ; un sélecteur
devant le libellé pose le code d'une ligne déjà écrite sans toucher au texte ni
au prix. Les activités ne sont PAS recopiées dans le catalogue — deux listes,
deux tarifs, et l'une finirait par mentir. La conduite et l'interne n'y sont
pas proposées. Un tarif absent laisse le prix VIDE plutôt que d'en mettre un
par défaut.

**Une ligne EN HEURES doit porter une activité.** Le sélecteur affiche
l'intitulé, pas seulement le code — il n'affichait que « 31 » sur 44 px, et un
code oublié ne se voyait pas. Quand la ligne est en heures et le code absent,
il passe en rouge (`requis`, depuis `estEnHeures`) ; l'éditeur compte les
lignes manquantes en tête de l'offre, avec l'endroit d'où elles viennent ; et
**une offre ne peut pas passer en « acceptée » tant qu'il en reste**. Les
autres statuts restent libres : une offre se rédige par étapes, et bloquer un
brouillon n'aiderait personne. Une ligne au kilomètre ou au forfait n'a pas
d'activité à porter et n'est jamais signalée.

**`lignesSansActivite` et `heuresParActivite` parcourent la MÊME liste**
(`lignesMainOeuvre`). C'est ce qui garantit que les lignes signalées à l'écran
sont exactement celles qui tombent dans `prevuSansCode` ; deux parcours
séparés finiraient par diverger, et l'offre dirait « tout est ventilé »
pendant que la jauge compterait des heures orphelines. Un test l'exige.

Les offres antérieures au 18 septembre 2026 n'ont aucun code. Elles sont
reprises À LA MAIN avant le 1er novembre 2026, date de mise en service de la
rentabilité et du premier dépôt de feuilles d'heures ; la colonne « à coder »
de `/planning` dit par quels projets commencer.

**L'export neutralise les formules.** Une cellule texte commençant par
`= + - @` est préfixée d'une apostrophe : une remarque « =HYPERLINK(...) »
recopiée d'une feuille deviendrait sinon un lien piégé dans Excel.

---

## kDrive — où Maze dépose les pièces

**Un seul identifiant en dur, et c'est une RACINE** : `ADMIN_ID = 53682`
(`amazing files / 00. Admin`). Tout le reste se résout PAR NOM
(`findOrCreateChild`).

Cette règle vient d'une panne silencieuse. Les deux dossiers de dépôt étaient
visés par leur propre id — `37796` et `37797`, « Claude Finance / Factures
fournisseurs » et « … / Justificatifs ». Ces ids appartenaient à l'ancien
`00. Admin`, **renommé `20. Admin Backup`** le jour où sa copie réorganisée a
pris sa place. Le code a donc continué d'écrire dans le backup pendant des
mois, sans qu'aucune erreur ne le signale : les dossiers existaient toujours.
Au 5 octobre 2026, 234 pièces s'y étaient rangées, et 234 copies homonymes
dormaient dans l'arbre vivant sans qu'aucune ligne de base ne les référence.
**Un id en dur ne survit pas à un renommage, et ne le dit pas.**

**`_Gestion/CONSIGNES-MAZE-PROJECT.md`, sur le drive, dit où classer.** À
relire avant de toucher au classement — mais ne pas en déduire plus que ce
qui est demandé : ce qu'il décrit du nommage et du dédoublonnage concerne le
rangement À LA MAIN, pas le code.

**Le classement, depuis le 16 octobre 2026 — UNE SEULE branche :**

```
00. Admin / Finances / Comptabilité / Comptabilité <année> / Justificatifs comptables / T<trimestre>
```

Justificatifs ET factures fournisseurs, ensemble. Elles ont d'abord eu deux
branches séparées (`Factures fournisseurs/` et `Justificatifs/`), fusionnées
par le reclassement : un contrôle fiscal porte sur un EXERCICE, pas sur la
façon dont une pièce est arrivée, et chercher un achat dans deux dossiers
selon qu'il portait un numéro de facture était une distinction pour nous, pas
pour le contrôleur. **Si `Factures fournisseurs/` ou `Justificatifs/`
réapparaissent, c'est que ce code écrit au mauvais endroit** — c'est la
sentinelle que donnent les consignes, et elle a servi : le code déployé le
16 octobre au matin les recréait.

**Ce qui n'est PAS une pièce d'achat ne se classe pas** : un décompte AVS, une
police, un bail, un bulletin de salaire, un relevé bancaire, un courrier
fiscal vont dans `00. Admin / Classement auto/`. Mieux vaut une pièce dans la
boîte d'entrée qu'une pièce au mauvais endroit.

**Les noms de fichiers n'ont PAS changé** : `<date>_<FOURNISSEUR>_<n°>.pdf`
pour une facture, `<date>_<MARCHAND>_<montant>.pdf` pour un justificatif. Les
consignes décrivent une convention de nommage pour le classement À LA MAIN ;
l'appliquer au code n'était pas demandé, a été fait puis défait le 16 octobre
2026. **La consigne portait sur la DESTINATION, rien d'autre.**

**Deux régimes dans ce chemin, et la frontière est voulue.** `Finances` et
`Comptabilité` sont la STRUCTURE : `dossierExistant` les exige, et un dépôt
échoue en disant lequel manque. L'année, la rubrique et le trimestre se créent
à la demande — en janvier, « Comptabilité 2027 » n'existe pas encore, et c'est
normal. Appliquer `findOrCreateChild` à un dossier de structure est exactement
ce qui a produit la panne : l'original renommé, un homonyme vide recréé à côté,
et les pièces qui s'empilent dans un arbre fantôme. **Un dépôt qui échoue en
annonçant pourquoi se répare en deux minutes ; deux cents documents mal classés
en silence coûtent une journée.**

Les scans ne vivent plus à côté de la comptabilité mais DEDANS, dans l'année
concernée : la fiduciaire n'a plus deux endroits à regarder pour un même
exercice. Le découpage par trimestre est celui de la TVA.

**Tout l'exercice est dans son dossier d'année.** Un contrôle fiscal n'ouvre
qu'un dossier, et les pièces d'achat de l'année y sont toutes dans
`Justificatifs comptables / T<n>` — celles déposées par Maze comme les 929
pièces de l'archive. Elles ont été séparées un temps, le 5 octobre, en pariant
qu'un même ticket pouvait être scanné deux fois des deux côtés ; le
reclassement a tranché autrement et dédoublonné à la main (2025 : 450 pièces,
450 contenus distincts).

**Deux choses ne sont PAS versées dans les années, et ne doivent pas l'être :**

- l'export bexio — son arborescence suit la date de SAISIE : « Saisie 2024 »
  contient des pièces de 2023, parce que la saisie se faisait par rattrapages.
  Le verser par année de document mélangerait les exercices. 3185 pièces,
  saisies de 2018 à 2026.
- `_Sans date` — trois pièces dont la date est illisible ou absente ; sans
  année, pas de destination.

Les 929 pièces parties dans les années, ce qui restait ne s'appelait plus
« Justificatifs comptables » : le dossier est devenu
**`Finances / Export bexio 2018-2026`**, nommé par ce qu'il contient.

**Le dédoublonnage du drive déréférence la base, en silence.** Quand le
reclassement garde un exemplaire et parque l'autre dans `_Gestion/Doublons/`,
c'est souvent le PARQUÉ que `kdrive_file_id` désigne : la pièce reste
ouvrable, jusqu'au jour où la corbeille se vide. Dix-sept l'étaient au
16 octobre 2026. `scripts/repointer-doublons.mjs` les remet sur l'exemplaire
conservé — en appariant sur des PREUVES (date du document, puis montant ou
numéro de facture retrouvé dans le nom conservé), jamais sur une ressemblance
de nom : l'exemplaire gardé a été renommé avec une description, il ne ressemble
plus au parqué. Un rapprochement sans montant ni numéro n'est pas appliqué, il
est listé. **À relancer après chaque séance de dédoublonnage.**

**L'année et le trimestre viennent de la date du DOCUMENT**, pas de celle du
scan (`quarterOf(date)` pour un frais, `quarterOf(issue_date)` pour une
facture). Une facture de décembre numérisée en janvier appartient à l'exercice
de décembre — c'est le seul classement qu'un comptable accepte. C'est ce qui a
rangé tout seul les deux pièces de 2025 dans `Comptabilité 2025`.

**Un déplacement kDrive CONSERVE l'identifiant du fichier** (vérifié sur un
fichier jetable avant de toucher à quoi que ce soit). C'est pour ça que la
reprise s'est faite par déplacement et non par copie : les 234 références de
`expenses.kdrive_file_id` et `supplier_invoices.kdrive_file_id` ont survécu
sans une seule écriture en base.

**Deux scripts de reprise**, `scripts/ranger-finance.mjs` (les 234 scans de
Maze) et `scripts/ranger-justificatifs.mjs` (les 929 pièces historiques), qui ne font rien sans
`--ecrire`, écrivent dans le MÊME journal TSV, et `scripts/annuler-ranger-finance.mjs`
le rejoue à l'envers. Il refuse d'écarter un « doublon » dont la TAILLE diffère de
l'original : même nom ne veut pas dire même fichier, et la version la plus
récente peut être celle qu'on s'apprêtait à jeter. Les doublons ne sont jamais
supprimés, seulement déplacés dans `00. Admin / _A supprimer` — vider reste un
geste humain.

**L'annulation ne vaut que tant que les dossiers d'origine existent.** Elle
rejoue des déplacements, donc elle a besoin de la destination d'origine. Les
coquilles vidées du 5 octobre 2026 — `Claude Finance` dans les deux arbres,
puis les dix dossiers d'année de `Justificatifs comptables` — ont été
supprimées à la demande, après contrôle récursif du vide : le reclassement de
cette journée n'est donc plus rejouable à l'envers par script. Reste la
corbeille kDrive. Les suppressions sont tracées dans le journal, en lignes de
commentaire que l'annulation ignore.

---

## Navigation — où va quoi

La sidebar a quatre zones, et leur ordre dit la fréquence :

```
accueil · projets · tâches · agenda · meeting · outils     ce qu'on ouvre en travaillant
MON TEMPS            horaires · heures · frais             ce que chacun saisit pour soi
FINANCES CLIENTS     …                                     (admin)
FINANCES INTERNES    …                                     (admin)
REPORTING            charge de l'atelier · journal         ce qu'on regarde (admin)
```

**Agenda, horaires et heures étaient côte à côte dans la liste plate** : trois
mots qui disent « temps » sans dire lequel, et qu'il fallait ouvrir pour s'en
souvenir. Seul l'agenda y reste — c'est le seul qu'on touche plusieurs fois par
jour. Les autres sont groupés sous une étiquette qui fait la moitié du travail :
*horaires* = étais-je là, *heures* = à quoi je l'ai passé, *frais* = ce que j'ai
avancé.

**REPORTING n'est pas une zone de travail.** La charge de l'atelier y est parce
qu'on l'ouvre pour décider si l'on peut dire oui à un client, pas pour
produire ; en tête de liste, à côté des projets, elle se faisait passer pour un
écran quotidien.

**Les frais ne sont PAS dans les horaires.** Un reçu de parking n'est pas une
demi-journée de vacances, et la page des horaires était deux écrans cousus.
`/frais` (tout le monde) est l'écran de celui qui DÉPENSE : photo du ticket,
scan, dépôt. `/justificatifs` (admin) est celui de celui qui CLASSE :
rapprochement, comptes, export. **Supprimer le dépôt plutôt que le déplacer
aurait retiré à un membre sa seule façon de rendre un ticket** — `/api/expenses`
ramène un non-admin à son propre nom, mais encore faut-il un écran.

**Tout écran retiré de `MAIN_ITEMS` doit figurer dans un groupe repris par
`BottomNav`**, sinon il devient inatteignable au doigt : la barre du bas est la
seule navigation sous 768 px, et dix-huit pages avaient déjà disparu ainsi.

**La pointeuse n'existe plus** (`clock_sessions`, `/api/clock-session`,
pointage arrivée/départ). Rien ne fermait jamais une session : au 5 octobre
2026, deux étaient ouvertes depuis le 27 août, et pointer le départ aurait
écrit une journée de travail datée de ce jour-là. La saisie des horaires se
fait à la main dans la fenêtre du jour — c'était déjà la seule voie qui
marchait (`schema-pointeuse-retrait.sql`).

---

## Agenda (`/agenda`)

**Une table, `agenda`, pour tout ce qui occupe quelqu'un** : production,
montage, démontage, trajet, meeting, admin, entretien. Google Agenda tenait ça
dans cinq calendriers séparés qui ne savaient ni à quel projet ni à quelle
activité vendue ils appartenaient — c'est ce lien qui manquait, pas un
calendrier de plus. Un bloc porte `project_id` et `activite`, donc il décharge
quelque chose.

**Pas d'heure de début.** Une demi-journée (`demi` = `am` | `pm`), et c'est
tout : un atelier ne commence pas une soudure à 9 h 15 parce qu'un calendrier
l'a écrit, et un horaire faux à la minute est un horaire qu'on cesse de lire.
**Une journée entière est DEUX lignes**, pas une troisième valeur `jour` —
sinon chaque somme de demi-journées traîne un cas particulier, et chaque oubli
de ce cas donne un total faux.

**La durée se compte par demi-heures** (`minutes`, multiple de 30, max 300),
et vide = toute la demi-journée. C'est ce qui permet de poser « 30 min de
ponçage léger » sans bloquer quatre heures : trois heures de peinture ne sont
pas un bloc de trois heures mais une demi-heure, un séchage, un ponçage et une
reprise. Une demi-journée vaut la MOITIÉ DU CONTRAT (4,2 h à 33,6 h/semaine),
jamais quatre heures en dur.

**Ce qui n'est pas dans `agenda`** : les absences restent dans `work_entries`
(elles disent « indisponible », pas « occupé à ceci », et chacun saisit les
siennes dans `/schedule`) ; les fériés ne sont dans aucune table, ils se
calculent ; les heures faites restent dans `heures`. **L'agenda dit le PRÉVU,
`heures` dit le constaté.**

**L'écran refuse de laisser poser du travail sur une absence** : congés et
fériés sont dessinés par-dessus la grille, et la demi-journée n'a alors pas de
bouton. C'est la faute que l'ancien planning laissait commettre en silence,
parce qu'il ignorait les congés.

**Un membre ne voit et n'écrit que son agenda** ; le nom vient du JWT. L'admin
voit l'équipe et place pour chacun — il est le seul garant du planning.
`/api/work-entries?userName=*` a été ouvert à l'admin pour la même raison :
poser un montage sur la semaine de vacances d'un collègue doit être impossible
à l'écran.

**`source` est posée par le serveur** (`main` | `offre` | `planificateur`), et
`fige` protège un bloc du futur planificateur : un montage annoncé au client
est une promesse, pas une préférence.

**La semaine type n'écrit AUCUN bloc.** Rangée dans
`app_settings.semaine_type` (admin), forme
`{ "Guillaume": { "1": ["admin", "production"] } }` où la clé est le jour au
sens de `getDay()`. Elle colore le fond des demi-journées vides et propose le
type au moment de poser. La matérialiser en centaines de blocs identiques
obligerait à les supprimer un par un le jour où l'habitude change. **Elle ne se
retire pas de la capacité de la jauge** : une partie de l'administratif est de
la gestion de projet, qui est vendue et porte son code — la retirer de la
capacité ET la compter dans la demande la compterait deux fois.

**Un bloc posé hors semaine d'atelier ne compte dans aucune capacité.** La
table accepte n'importe quelle date — un montage exceptionnel un samedi se
consigne — mais `JOURS_TRAVAILLES` ne connaît que lundi, mardi, jeudi,
vendredi, et la jauge non plus. L'écran le dit au lieu de le cacher.

---

## Charge de l'atelier (`/planning`) — admin

**Une seule question : « est-ce qu'on peut prendre ce projet ? »** L'écran ne
pose aucun bloc, ne choisit aucun ordre, ne connaît ni le séchage de la
peinture ni les délais de livraison. Il compare ce qu'on doit encore au temps
qui reste. Tout le calcul vit dans `lib/capacite.js`, testé sans base ni
réseau ; `/api/capacite` ne fait que rassembler les ingrédients, et la page
n'affiche. **Si l'écran se met à calculer, c'est qu'il faut le remonter dans
la lib.**

**Aucune table nouvelle.** Les heures viennent de l'offre (chaque ligne de
main-d'œuvre porte son code d'activité), le réel des heures imputées, les
congés de `work_entries`, le contrat de `work_settings`. L'écran remplace
l'ancien planning par demi-journées, qui demandait de ressaisir à la main ce
que l'offre savait déjà. `work_slots` et `lib/googleCalendar.js` ne sont donc
plus lus par `/planning` — l'agenda de l'étape suivante les reprendra ou les
enterrera.

**« Ça ne rentre pas » a toujours raison ; « ça rentre » dit seulement qu'il
n'y a pas de mur.** La jauge suppose le travail infiniment divisible et ignore
l'ordre des étapes : vingt heures de peinture « rentrent » dans vingt heures
libres, même si le séchage les étale sur trois semaines.

**Deux choses qu'un total global cache, et que l'écran montre :**

- **le goulot** — une activité qu'une seule personne sait faire peut déborder
  alors que la somme des deux capacités tient largement. Avec deux personnes
  l'attribution se résout EXACTEMENT : ce qu'un seul sait faire lui est
  imposé, le reste va dans un pot commun, et ça tient si chacun absorbe son
  imposé ET si le total rentre dans le total ;
- **le mur** — la première échéance qui casse. Chaque palier porte tout ce qui
  est dû avant lui : décembre peut tenir quand la semaine du 20 octobre est
  déjà perdue, parce que trois chantiers tombent le même jour.

**La fenêtre part de DEMAIN.** La journée en cours est entamée ; la compter
entière promet des heures qu'on n'a plus. Elle finit à la dernière échéance
engagée, **mais jamais à moins de huit semaines** : sans ce plancher, un
atelier dont tout est livré dans quinze jours n'aurait que quinze jours à
opposer au prochain client et refuserait un projet qu'il a tout le temps de
faire. `?au=YYYY-MM-DD` pose la question sur une autre date.

**Une échéance déjà passée ne fait pas un palier.** Il n'y a plus une heure
disponible avant elle : elle ne tiendrait jamais, et le mur désignerait
toujours la plus vieille date en retard au lieu de la prochaine qui va céder.
Ces heures sortent dans `enRetard` — et continuent de peser sur tous les
paliers suivants, parce qu'un retard ne s'efface pas, il se reporte.

**Les heures sans code d'activité ne comptent dans aucune jauge.** Elles sont
dues, mais on ne sait pas qui sait les faire. Les offres antérieures au
18 septembre 2026 n'ont aucun code : au 3 octobre 2026, c'est 218 h sans code
contre 75 h comptées sur les offres acceptées. L'écran l'affiche en tête, et
tant que ce chiffre est le plus gros des deux **la jauge est optimiste par
construction**.

**Les compétences vivent dans `app_settings.competences`**, pas dans une
table : deux personnes et une vingtaine d'activités, quarante cases qui
bougent une fois par an (même arbitrage que les coefficients de peinture).
Forme `{ "Arnaud": [20, 21, …] }` — la liste des codes que la personne SAIT
faire. **Une personne absente de l'objet sait tout faire** : c'est l'état de
départ, et il vaut mieux une jauge optimiste qu'une jauge qui refuse un projet
parce qu'un écran n'a pas été rempli. Clé ADMIN en lecture comme en écriture :
c'est elle qui décide qu'un chantier « ne rentre pas », et une erreur ici fait
refuser un projet qu'on aurait pu prendre.

**Une personne sans `work_settings` n'a aucune capacité.** Inventer une
semaine de 42 h pour quelqu'un dont on ne sait rien ferait tenir des projets
qui ne tiennent pas. L'écran dit alors qu'il n'a rien à mesurer et renvoie
vers `/schedule`.

**`weekly_hours` se divise par les jours TRAVAILLÉS, pas par cinq.** L'atelier
travaille lundi, mardi, jeudi, vendredi (`JOURS_TRAVAILLES`) : 33,6 h donnent
8,4 h par jour, pas 6,72 h — le temps d'un jour qui n'existe pas.

**Les jours fériés vaudois sont dans `lib/joursFeries.js`**, extraits de
`schedule.js` où ils vivaient au milieu d'un composant. Il y MANQUAIT le Lundi
du Jeûne fédéral (le lundi suivant le troisième dimanche de septembre) : une
journée de travail comptée en trop chaque année. Le 1er mai n'y est pas, et
c'est volontaire — il est férié à Genève, pas dans le canton de Vaud.

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

## Capacitor (iOS — échafaudage, en devDependencies)

**Les trois paquets `@capacitor/*` sont en `devDependencies`, et doivent y
rester.** Aucun fichier de `pages/`, `lib/`, `components/` ou `scripts/` ne les
importe : ils ne servent qu'à fabriquer un binaire natif, ce qui ne se fait pas
aujourd'hui (cf. « Sur iPhone » — c'est la PWA qui est installée). Un paquet
d'outillage en dépendance de PRODUCTION, c'est un avis de sécurité qui bloque
le déploiement d'une fonctionnalité que personne n'utilise : arrivé le
16 octobre 2026 avec GHSA-rvm3-566m-v7fv sur `@capacitor/ios`, corrigé en
6.2.2 puis reclassé.

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

**Le dossier kDrive d'un projet ne se crée JAMAIS tout seul.** Il se fabriquait
au premier dépôt de fichier, en silence : des projets qui n'avaient besoin
d'aucun fichier — une intervention d'une heure — se retrouvaient avec un
dossier vide que personne ne rangeait. Les quatre routes de dépôt (fichiers,
dump, visuels et PDF de présentation) répondent maintenant 409 avec
`SANS_DOSSIER` (lib/kdrive.js) quand le projet n'a pas de dossier ; la fiche
projet propose alors les deux gestes, « créer le dossier »
(`/api/projects/[id]/kdrive-folder`) ou « choisir un dossier existant ». Un
projet SANS dossier est un état normal, pas un oubli.

**Dupliquer un projet ne recopie ni son dossier, ni son passé.** Le même
chantier se refait six mois plus tard : `projectCopy` (lib/duplicateDoc.js)
reprend client, contact, résumé, notes, logistique, démontage, visite sur
place et toute l'offre. Trois choses ne suivent JAMAIS, et pour des raisons,
pas par goût. Le `kdrive_folder_id` : deux projets sur un même dossier
mélangent leurs pièces, et la règle de la maison veut que ce dossier soit un
geste. La `synthese` : c'est un condensé des mises à jour, qui elles ne
suivent pas — la garder attribuerait à la copie une histoire qui n'a pas eu
lieu. Le numéro d'offre et la `reference` client : ils désignent des documents
déjà émis. L'offre repart en brouillon (`offerCopy`), la phase à zéro, la
pause levée. Tâches, fichiers, heures et coûts ne suivent pas non plus : c'est
le TRAVAIL fait sur le chantier d'origine, pas sa définition. La copie se fait
côté serveur (`/api/projects/[id]/dupliquer`) — `quote_data` porte les prix
d'achat et n'a aucune raison de faire l'aller-retour par le navigateur pour
être réécrit tel quel.

**La référence imprimée est celle de la FACTURE, à défaut celle du projet.** Un
chantier facturé en acompte puis en solde peut porter deux bons de commande ;
`customer_invoices.reference` prime donc sur `projects.reference`. Elle
s'affiche sous l'OBJET du document, où on la cherche, et non plus dans
l'en-tête à côté des dates.

**Un identifiant kDrive venant du navigateur n'est pas une autorisation.** Le
serveur a un token très privilégié. Soit le fichier est référencé en base et
`lib/kdriveAccess.js` tranche, soit il présente un jeton signé
(`lib/signedRef.js`) que le serveur a lui-même émis en le listant. La
navigation ne part que de la racine du projet. Les pièces comptables sont
réservées à l'admin, les frais à leur auteur.

**La destination gardée pendant la connexion ne peut pas sortir de Maze.**
`_app.js` renvoie sur `/login?suite=<chemin>` pour qu'un QR d'économat scanné
à l'atelier ne perde pas sa page — mais `lib/suiteConnexion.js` n'y laisse
passer qu'un chemin interne. `//evil.ch` est une URL ABSOLUE pour le
navigateur, pas un chemin : c'est exactement ce qu'un `startsWith('/')`
laisserait passer, et une redirection ouverte après une VRAIE connexion depuis
un VRAI lien Maze est la forme classique du hameçonnage.

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

**Deux niveaux dans Logistique** : événement → ligne. Un chantier se déplace
plusieurs fois — la pose, puis la reprise trois semaines plus tard — et chaque
passage a son trajet, son montage et son démontage. En vrac dans une seule
liste, on ne sait plus lequel va avec lequel, ni au chiffrage ni sur le PDF.
L'événement n'a pas de prix propre : son total est la somme de ses lignes,
comme un item. Son nom est FACULTATIF, et c'est ce qui rend la bascule
invisible : un événement sans nom ne pose aucun en-tête et ses lignes
s'impriment au premier niveau, exactement comme avant. `quote_data.logistics`
était un tableau PLAT de lignes jusqu'au 24 septembre 2026 ;
`evenementsLogistiques()` relit les deux formes, ligne par ligne, et une offre
ancienne réimprimée donne le même PDF — un test compare les deux sorties.
`normaliserDevis` continue d'exposer `logistics` À PLAT en plus des
événements : les totaux, la marge transport et la rentabilité raisonnent ligne
par ligne, leur imposer de traverser les groupes n'apprendrait rien et
multiplierait les endroits où l'oublier.

**Trois niveaux dans Fabrication** : item → élément (facultatif) → composition.
Seule la composition porte des quantités et des prix ; un item et un élément
valent la somme de ce qu'ils contiennent. La graisse suit le RÔLE de la ligne,
pas sa profondeur : une composition n'est jamais en gras, qu'elle tienne sous
un item ou sous un élément.

**Un acompte est une FACTURE à part entière** (`customer_invoices.type`) :
même table, même séquence de numéros, même QR-bill, même PDF. Il est envoyé,
payé, rapproché en banque et comptabilisé comme les autres ; en faire un objet
séparé aurait obligé à lui refabriquer chacune de ces vies. Le bouton
n'apparaît que si l'offre est ACCEPTÉE — demander de l'argent d'avance sur un
brouillon qu'on va corriger n'a pas de sens, et c'est ce total-là qui sert de
base.

Trois règles arbitrées le 26 octobre 2026, et aucune n'est un détail :

1. **La TVA est due sur l'acompte.** Il porte donc la sienne, et la facture
   finale déduit l'acompte **TTC**. La déduire du HT la compterait deux fois.
   C'est la seule place juste, et `invoiceTotals` la met après la TVA.
2. **Un pourcentage porte sur le TOTAL HT de l'offre**, la TVA venant
   par-dessus : l'acompte reste une facture ordinaire.
3. **`amount` d'une facture finale est CE QUI RESTE À PAYER.** C'est ce que le
   client vire, donc ce que le rapprochement bancaire retrouvera ; l'acompte a
   déjà été comptabilisé sur sa propre facture. `amount_net` et `vat_amount`
   restent ceux de la facture ENTIÈRE — le document montre le total complet,
   puis la déduction, puis le solde.

**Le montant d'un acompte n'est pas une donnée libre : il se RECALCULE.** La
base (`acompte_base`) et la valeur saisie sont stockées ; la somme se déduit de
`quote_snapshot` à chaque validation serveur. C'est ce qui permet de refuser un
montant fabriqué par le navigateur, exactement comme pour les autres totaux.

**La somme des acomptes à déduire se lit EN BASE, jamais dans le corps de la
requête.** Un navigateur qui annoncerait vingt mille francs d'acomptes se
ferait une facture à zéro. Même règle que l'identité, qui vient du JWT.

**Ce que la facture finale déduit est FIGÉ à l'émission**
(`acomptes_deduits`, un instantané `[{ id, numero, date, montant }]`). Même
raison que le forfait de transport qui recopie sa distance : annuler un acompte
six mois plus tard ne doit pas réécrire ce que le client a reçu.

**Un acompte annulé ne se déduit pas ; un acompte impayé, si.** L'annulé ne
sera jamais payé. L'impayé reste dû — il est une créance ouverte sur sa propre
facture, et le client doit le solde quoi qu'il arrive.

**Des acomptes qui dépassent le total ne font pas une facture négative.** Le
solde est borné à zéro et l'excédent est annoncé à l'écran : un trop-perçu
demande une note de crédit, pas une facture que le rapprochement bancaire ne
pourra jamais solder.

**Le PDF d'un acompte ne détaille pas l'offre** — une seule ligne. Imprimer le
détail du chantier à côté d'un sous-total qui n'en est qu'une fraction donne un
document qui se contredit ; le client a déjà le détail dans son offre.

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
n'en affichent qu'un mot. Le paramètre ne laisse que `quote_data.status`, sans
changer le format. `/offres` et les pages de facture gardent la réponse
entière : elles recalculent les totaux.

**On ne revalide plus au retour d'onglet.** `revalidateOnFocus` relançait
toutes les requêtes de la page à chaque fois que l'onglet reprenait le focus —
dix, sur la fiche projet, chacune au minimum 200 ms : le coût nu d'une fonction
serverless chez Vercel, avant la moindre requête à la base. Nous sommes deux à
utiliser le logiciel et les écritures appellent déjà `mutate()`. La
revalidation à la reconnexion reste, elle : là, le cache a pu manquer quelque
chose.

**La barre latérale compte, elle ne liste pas.** Ses deux badges se
déduisaient de `/api/projects?light=1` et `/api/tasks`, chargés sur CHAQUE
page : 139 Ko et les deux requêtes les plus lourdes du logiciel, pour deux
entiers. `/api/compteurs` les compte avec `head: true` — aucune ligne ne
transite, la réponse fait 25 octets. En contrepartie les badges ne suivent plus
les listes : une page qui crée, archive ou termine doit appeler
`useRafraichirCompteurs()` (`lib/swr.js`), sinon le chiffre reste figé.

---

## Présentations client (`/presentations/[id]`)

Le support envoyé au client avec l'offre : couverture, contexte, brief,
pourquoi nous, aperçu des pièces, méthode des visuels, une paire de pages par
pièce (visuels + détail), matériaux, planning, budget, conditions, clôture.
Il se construisait avant à la main dans Claude Design, hors de Maze, et le PDF
exporté ne revenait jamais dans le dossier du projet.

**Le récit est fixe, les textes ne le sont pas.** `lib/deck.js` déroule les
pages ; le modèle de langue ne choisit ni l'ordre ni le nombre de pages. C'est
ce qui rend le rendu reproductible — laisser un modèle composer la mise en page
donne une présentation superbe une fois sur trois.

| Fichier | Rôle |
|---|---|
| `lib/deck.js` | l'ordre des pages, la numérotation des pièces, `trous()` |
| `lib/deckHtml.js` | les 13 gabarits, la toile 1920 × 1080, les polices embarquées |
| `lib/deckGabarit.js` | le gabarit vierge et les textes fixes de la maison |
| `lib/presentation.js` | amorçage depuis le projet et l'offre, emplacements de visuels |
| `lib/deckRedaction.js` | le prompt, et `validerSortie` qui borne ce que le modèle produit |
| `pages/api/transcription.js` | dictée et vocaux → texte (Whisper via Groq ou OpenAI) |
| `scripts/apercu-deck.mjs` | rend le gabarit en PDF, sans base ni réseau |

Règles à ne pas casser :

- **Le handoff du design system fait foi** (projet Claude Design `4434681b`) :
  page de 1920 × 1080 exactement, marges 88 / 104 / 72, cinq tailles de texte,
  zéro ombre et zéro dégradé, corail réservé au « × » du titre et au « ! » de la
  chute, deux rayons (15 px contenu, 50 px cliquable), cadres d'image blancs
  même sur fond noir. Tout le texte est SAISI en minuscules, jamais mis en
  minuscules par le CSS.
- **Une page qui déborde est un problème de contenu**, pas de mise en page : le
  corps ne se réduit pas, le texte se coupe. Les largeurs en `ch` des gabarits
  disent au modèle combien de signes il a le droit d'écrire.
- **On raconte, on ne remplit pas.** L'écran est une zone de texte (dictable),
  une zone de dépôt de visuels et un bouton. Le premier essai était un
  formulaire de dix-sept sections : c'est exactement ce que le passage par
  Claude Design évitait. La relecture champ par champ reste accessible, repliée,
  pour une faute de frappe.
- **Le nombre de pièces vient du projet**, jamais d'un réglage : le modèle le
  déduit du récit et des fichiers déposés. Une vitrine sous trois angles fait
  une paire de pages, douze éléments en font douze.
- **Les visuels se rattachent par leur NOM** (`vitrine_3d.png`, `vitrine_ia.png`) :
  le modèle cite un nom, le serveur seul le résout en identifiant kDrive. Un nom
  inconnu laisse un cadre tireté, jamais une image au hasard.
- **`validerSortie` borne tout ce que le modèle renvoie** : clés inconnues
  jetées, listes tronquées à ce que la page sait afficher, budget recalculé
  depuis l'offre et posé après coup, conditions fixes de la maison réimposées.
  Un modèle qui « corrige » un total produit un document faux que personne ne
  relit — il ne doit donc jamais pouvoir l'écrire.
- **Un montant absent n'imprime rien**, jamais `0.00` : une ligne offerte
  s'écrit `offert`, donc un zéro doit rester un argument, pas un trou.
- **Les visuels vivent sur kDrive**, dans le dossier du projet ; le document
  n'en garde que l'identifiant, et le PDF les embarque en base64 au rendu —
  Chromium n'a pas de jeton kDrive, et une image qu'il ne charge pas ne lève
  aucune erreur.
- **`/api/presentations/[id]/pdf` doit rester dans `outputFileTracingIncludes`**
  avec le binaire Chromium ET `public/fonts` : sans les Apercu Pro, le deck sort
  en Helvetica, en production seulement.
- Le chemin d'un emplacement de visuel vient du navigateur : `emplacementImage`
  le vérifie segment par segment. Il ne désigne jamais autre chose qu'un objet
  déjà présent dans le document.

---

## Travail à plusieurs sessions

Guillaume ouvre une session par chantier — un outil, un écran, une intégration.
Une session **intègre** (celle-ci, ouverte sur le dépôt entier), les autres
**fabriquent**. Ce découpage existe parce que deux sessions dans le même dossier
de travail se marchent dessus en silence : un `git add -A` de l'une emporte les
fichiers en cours de l'autre. C'est arrivé le 17 septembre 2026 avec
`lib/assurances.js`, rattrapé de justesse.

**Si tu es une session qui FABRIQUE :**

1. Tu ne pousses jamais. Tu commites sur ta branche, et tu le dis.
2. Tu ne touches à AUCUN fichier partagé. Ils appartiennent à l'intégration :
   `pages/outils/index.js`, `next.config.js`, `CLAUDE.md`, `scripts/check-db.mjs`,
   `pages/_app.js`, `components/NavBar.js`, `lib/theme.js`. Ce qu'il faut y
   ajouter, tu l'écris dans ton message de livraison — tu ne l'écris pas toi-même.
3. Ton chantier est autonome : une page sous `pages/`, tout le calcul dans
   `lib/<nom>.js`, des tests dans `tests/`. Si ton calcul n'est pas testable sans
   écran, il n'est pas au bon endroit.
4. Tu livres en un message : ce que ça fait, les fichiers que tu as créés, ce
   qu'il faut ajouter aux fichiers partagés, et la migration SQL s'il y en a une.
5. `npm run lint` et `npm test` doivent être verts avant de livrer.

**Si tu INTÈGRES :** tu es responsable de `main`. Tu relis ce qui est livré, tu
appliques toi-même les changements aux fichiers partagés, tu fais tourner lint,
tests et build, et tu pousses — seulement quand Guillaume l'a demandé. Tu écris
aussi la sonde `check:db` et la ligne du tableau des migrations : une migration
sans sonde est une migration qu'on oubliera.

**Ne lance JAMAIS `npm run build` pendant qu'un serveur de dev tourne dans le
même dossier.** Les deux écrivent dans `.next` : le serveur se met alors à
répondre 500 sur toutes les pages (`Cannot find module './chunks/vendor-chunks/
next.js'`), et rien dans le message ne désigne la cause. C'est arrivé deux fois
le 17 septembre 2026, entre deux sessions. Le remède : arrêter le serveur,
`rm -rf .next`, relancer. Pour vérifier qu'un build passe, préviens l'autre
session ou arrête le serveur d'abord.

**Ouvre les sessions DANS le dossier du projet** (`~/atelier-planning`), pas dans
`~`. Une session ouverte ailleurs ne lit pas ce fichier et redécouvre tout.

Les sessions vivantes se voient entre elles et s'écrivent directement ; mais un
message est éphémère et une session se ferme. Ce qui doit survivre s'écrit ici.

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
| `schema-agenda.sql` | table `agenda` (demi-journées typées, remplace `work_slots`) | `DROP TABLE agenda;` |
| `schema-pointeuse-retrait.sql` | supprime `clock_sessions` (pointeuse retirée) | aucun — le code lecteur est supprimé |
| `schema-bank-classification.sql` | `bank_transactions.classification` + comptes par défaut (salaires, virements internes) | en fin de fichier |
| `schema-heures.sql` | `projects.numero`, tables `activites` et `heures` | en fin de fichier |
| `schema-project-couts.sql` | table `project_couts` (coûts réels saisis par projet) | en fin de fichier |
| `schema-activites-tarifs.sql` | `activites.tarif_vente`, `activites.cout_revient` | en fin de fichier |
| `schema-activites-facturation.sql` | `activites.facturee_heure` (conduite et interne à false) | en fin de fichier |
| `schema-activites-renumerotation.sql` | codes d'activité en dizaines par famille ; heures suivies | transaction : tout ou rien |
| `schema-consulting.sql` | `heures.contact_id` : une heure peut viser un client au lieu d'un projet | en fin de fichier |
| `schema-transport-reglages.sql` | réglages `transport` (véhicules, forfaits) et `couts_vehicules` (admin) | en fin de fichier |
| `schema-presentations.sql` | table `presentations` (support client envoyé avec l'offre) | en fin de fichier |
| `schema-annuaire.sql` | tables `annuaire`, `annuaire_categories`, `annuaire_liens` | en fin de fichier |
| `schema-invoice-reference.sql` | `customer_invoices.reference` (réf. propre à la facture) | en fin de fichier |
| `schema-economat.sql` | tables `economat_categories`, `economat_fournisseurs`, `economat_articles`, `economat_commandes` + arbre, couleurs et fournisseurs de départ | en fin de fichier |
| `schema-acomptes.sql` | `customer_invoices.type`, `acompte_base`, `acompte_valeur`, `acomptes_deduits` | en fin de fichier |

`schema-prospects.sql` (les trois tables de prospection) a été jouée le
4 septembre 2026 et vérifiée par `check:db`.

**Depuis le 30 octobre 2026, une table nouvelle doit porter ses GRANTs.**
Supabase n'accorde plus l'accès à l'API de données automatiquement : sans
`GRANT`, la table est injoignable — y compris par nos routes, qui utilisent
pourtant la clé service-role — et l'erreur est un « permission denied » qui ne
dit pas d'où il vient. Les tables existantes gardent leurs droits ; seules les
migrations à venir sont concernées, ainsi que tout rejeu du schéma depuis zéro.

Toute migration créant une table ajoute donc, dans le MÊME fichier :

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ma_table TO service_role;
```

Et RIEN pour `anon` ni `authenticated` : l'accès passe exclusivement par les
routes API en service-role (cf. Sécurité), et la seule exception — la lecture
de `profiles` par le navigateur après l'ouverture de session — porte sur une
table qui existe déjà. Accorder large « au cas où » rendrait une future
politique RLS permissive beaucoup plus coûteuse.

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

**Les tests tournent en `TZ=Europe/Zurich`**, fixé dans le script `test`. Ce
n'est pas un détail de confort : la moitié des calculs de date de cette
application dépendent du fuseau LOCAL, parce qu'ils répondent à des questions
vécues — « est-ce en retard aujourd'hui ? », « cette tâche a-t-elle été
terminée aujourd'hui ? ». Ces calculs tournent dans le NAVIGATEUR, donc à
Zurich ; la CI, elle, tourne en UTC. Sans ce réglage, un test qui décrit
correctement le comportement suisse échoue en CI, et un test écrit sous UTC
laisse passer le décalage de deux heures qui a déjà mordu deux fois.

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
dépendances et détection de secrets. Le lint passe en premier : c'est le
contrôle le plus rapide.

**Deux avis restent ouverts, et ils exigent Next 16** (au 16 octobre 2026) :
`postcss` (high) et `next` (moderate), tous deux corrigés par un saut de
majeure, donc une migration de framework et non un correctif. Ni l'un ni
l'autre n'expose cette application : l'avis `postcss` porte sur la lecture de
source maps AU BUILD, celui de Next sur l'empoisonnement de cache EN
AUTO-HÉBERGEMENT — on déploie sur Vercel. À traiter comme un chantier, avec
son propre build de vérification.

**L'audit distingue « faille critique » de « npm injoignable »**
(`scripts/check-audit.mjs`). Le 4 septembre 2026, l'endpoint d'audit de npm a
répondu 503 : `npm audit` a attendu SEPT minutes puis échoué, et deux builds
sont partis au rouge sur du code sain. Le script réessaie trois fois, borne
l'attente à 90 s, et sépare les deux cas — une faille critique en production
bloque, un registre injoignable produit un avertissement et laisse passer. Ce
n'est pas un laisser-passer : le contrôle repasse au build suivant, et bloquer
un correctif urgent parce que npm a le hoquet coûte plus cher que de reporter
de quelques heures. C'est le même arbitrage que « bloquant sur critical
seulement » et pas sur « high ». Elle n'a accès
ni à la base ni aux secrets de production.
