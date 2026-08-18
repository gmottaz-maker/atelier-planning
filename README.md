# Maze Project

Application interne d'Amazing Lab, atelier de fabrication événementielle à
Genève. Elle couvre les projets, les tâches, les horaires, les offres, les
factures émises et fournisseurs, les notes de frais, le stockage client, le
rapprochement bancaire et la comptabilité.

Production : <https://mazeproject.amazinglab.ch>

> Elle manipule des données clients et des pièces comptables. Lire
> [SECURITY.md](SECURITY.md) avant de toucher aux routes API, aux fichiers ou
> aux autorisations — les règles qui y figurent corrigent des failles réelles.

## Pile technique

- **Next.js 14**, Pages Router, JavaScript (pas de TypeScript)
- **Supabase** — PostgreSQL et authentification
- **Tailwind CSS**, plus des styles en ligne et les jetons de `lib/theme.js`
- **Vercel** — hébergement et déploiement automatique depuis `main`
- **Vitest** — 197 tests unitaires

## Démarrer en local

```bash
git clone git@github.com:gmottaz-maker/atelier-planning.git
cd atelier-planning
npm ci
cp .env.example .env.local     # puis remplir
npm run dev                    # http://localhost:3000
```

`.env.example` documente chaque variable, lesquelles sont serveur uniquement,
et ce qui cesse de fonctionner sans elle. Trois sont indispensables au
démarrage : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY`.

Les comptes sont créés dans Supabase Auth, puis reliés à un nom et un rôle dans
la table `profiles`. Il n'y a pas d'inscription publique.

## Commandes

```bash
npm run dev             # serveur de développement
npm run build           # build de production
npm test                # suite Vitest
npm run check:secrets   # balaie les fichiers suivis (tourne aussi en CI)
npm run check:db        # vérifie que les migrations attendues sont en base
```

## Base de données

Les migrations sont des fichiers `*.sql` à la racine, exécutés **à la main**
dans l'éditeur SQL Supabase. Il n'y a pas de registre automatique de ce qui a
été joué : `npm run check:db` interroge la base et signale ce qui manque.

L'ordre d'application et l'état courant sont tenus dans la section
« Migrations SQL » de [CLAUDE.md](CLAUDE.md). Chaque fichier porte en tête ses
contrôles préalables et en pied son rollback.

Règles :

- une migration s'exécute **avant** le déploiement du code qui en dépend ; le
  code sait retomber sur l'ancien comportement si l'objet manque, l'inverse
  n'est pas vrai ;
- `schema-security-lockdown.sql` s'exécute **en dernier** si l'ensemble est
  rejoué depuis zéro ;
- sauvegarder avant toute migration destructive, et ne jamais en jouer une en
  production sans avoir lu son rollback.

## Déploiement

Un push sur `main` déclenche Vercel. La CI (`.github/workflows/ci.yml`)
exécute sur chaque pull request : `npm ci`, les tests, le build de production,
l'audit des dépendances et la détection de secrets. Elle n'a accès ni à la base
ni aux secrets de production — le build tourne avec des valeurs factices.

Rollback : *Instant Rollback* depuis le tableau de bord Vercel, ou `git revert`
puis push. Si le déploiement embarquait une migration, appliquer d'abord le
rollback SQL du fichier concerné.

## Organisation du code

Le détail vit dans [CLAUDE.md](CLAUDE.md) — arborescence, conventions, pièges
connus et invariants de sécurité. En résumé :

```
pages/           écrans et routes API (~50 routes, toutes vérifient le JWT)
components/      UI partagée entre au moins deux écrans
lib/             calculs, accès aux services externes, règles d'autorisation
tests/           Vitest — calculs, parsing, nommage, autorisations
scripts/         scripts ponctuels et contrôles, lancés à la main
*.sql            migrations, à exécuter dans l'éditeur Supabase
```

## Écran d'atelier

`/display` tourne en plein écran sur la TV de l'atelier, sans session. C'est la
seule page publique. Elle lit `/api/display-projects`, qui n'expose que neuf
colonnes — voir [SECURITY.md](SECURITY.md).
