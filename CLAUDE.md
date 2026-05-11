# atelier-planning — Contexte projet

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

```
pages/
  _app.js              — Auth Supabase, contexte global (useAuth hook)
  index.js             — Liste des projets logistiques (page principale)
  home.js              — Dashboard accueil + Google Calendar
  schedule.js          — Horaires + congés + frais (page principale utilisateurs)
  tasks.js             — Tâches globales
  activity.js          — Vue activité
  settings.js          — Paramètres utilisateur
  login.js             — Page de connexion
  display.js           — Affichage mural (vue publique)
  projects/[id].js     — Détail d'un projet logistique

  api/
    work-entries.js        — CRUD entrées horaires
    work-settings.js       — Paramètres contrat (heures/sem, congés)
    expenses/
      index.js             — CRUD frais
      scan.js              — OCR reçu via OpenAI Vision
    projects/
      index.js             — CRUD projets
      [id].js              — Détail projet
      files/               — Upload/download fichiers projet
    tasks/
      index.js             — CRUD tâches
      [id]/                — Détail tâche
    clients.js             — Sync clients Odoo
    todoist-webhook.js     — Webhook Todoist → import projets
    push/                  — Notifications push
    activity/              — Données activité
    clock-session.js       — Sessions de pointage
    site-visit-summary.js  — Résumé visite chantier

components/
  NavBar.js              — Barre de navigation (sticky, mobile bottom nav)

lib/
  supabase.js            — Client Supabase côté browser
  supabase-server.js     — Client Supabase côté serveur (service role)
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

- Couleur principale : `const PINK = '#FF4D6D'`
- Pas de composants séparés par page — tout est dans le fichier de la page
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
cd ~/Downloads/atelier-planning/ios/App
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
