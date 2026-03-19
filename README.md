# Atelier Planning

Outil de planning pour atelier de fabrication sur mesure.

- **`/`** — Interface admin (Guillaume) : créer, modifier, archiver les projets
- **`/display`** — Écran atelier (Arnaud & Gabin) : timeline auto-rafraîchissante

---

## Installation en 5 étapes

### 1. Créer la base de données Supabase (gratuit)

1. Aller sur [supabase.com](https://supabase.com) → **New project**
2. Choisir un nom (ex: `atelier-planning`) et un mot de passe
3. Une fois créé, aller dans **SQL Editor** → **New query**
4. Coller le contenu de `schema.sql` → cliquer **Run**
5. Aller dans **Settings → API** → copier :
   - `Project URL` → c'est votre `SUPABASE_URL`
   - `anon / public key` → c'est votre `SUPABASE_ANON_KEY`

### 2. Mettre le code sur GitHub

```bash
# Dans le dossier du projet
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/VOTRE_USERNAME/atelier-planning.git
git push -u origin main
```

### 3. Déployer sur Vercel

1. Aller sur [vercel.com](https://vercel.com) → **Add New Project**
2. Importer votre repo GitHub `atelier-planning`
3. Dans **Environment Variables**, ajouter :
   - `NEXT_PUBLIC_SUPABASE_URL` → votre URL Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → votre clé Supabase
4. Cliquer **Deploy** → attendre ~2 minutes
5. Votre app est en ligne ! (ex: `atelier-planning.vercel.app`)

### 4. Tester en local (optionnel)

```bash
cp .env.example .env.local
# Remplir .env.local avec vos vraies valeurs Supabase

npm install
npm run dev
# Ouvrir http://localhost:3000
```

### 5. Configurer l'écran atelier

Sur l'écran dans l'atelier, ouvrir Chrome en plein écran sur :
```
https://votre-app.vercel.app/display
```

L'écran se rafraîchit **automatiquement toutes les 60 secondes**.

---

## Utilisation

### Interface Admin (`/`)
- **Nouveau projet** → remplir le formulaire (nom, client, deadline, livraison, responsable)
- **✏️ Modifier** → changer n'importe quel champ
- **✅ Archiver** → marquer comme terminé (disparaît de la timeline)
- **🗑️ Supprimer** → suppression définitive

### Couleurs
- 🤖 **Auto** : vert (>2 sem) → orange (<2 sem) → rouge (<1 sem) → rouge foncé (en retard)
- Possibilité de forcer une couleur manuellement par projet

### Vue Display (`/display`)
- **2 semaines** : Gantt sur les 14 prochains jours
- **Mois** : Gantt sur les 28 prochains jours
- **Cartes** : vue par colonnes d'urgence (cette semaine / 2 sem / plus tard)
- Bouton **↻** pour rafraîchir manuellement

---

## Structure du projet

```
atelier-planning/
├── pages/
│   ├── index.js          ← Interface admin
│   ├── display.js        ← Écran atelier
│   └── api/projects/     ← API REST (lecture/écriture)
├── lib/
│   └── supabase.js       ← Connexion base de données
├── styles/
│   └── globals.css
├── schema.sql            ← Créer la table Supabase
└── .env.example          ← Modèle variables d'environnement
```
