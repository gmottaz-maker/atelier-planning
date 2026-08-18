# Sécurité — Maze Project

Application interne d'Amazing Lab. Elle porte des données clients, des pièces
comptables, des relevés bancaires et des notes de frais. Ce document dit
comment elle se protège, et ce qu'il ne faut pas défaire.

## Signaler un problème

Écrire à hello@amazinglab.ch. Ne pas ouvrir d'issue publique pour une faille.

## Modèle de menace

Trois profils, par ordre de probabilité :

1. **Un membre de l'équipe qui va là où il ne devrait pas.** C'est le cas le
   plus courant et celui contre lequel la plupart des contrôles sont écrits :
   comptes légitimes, curiosité ou erreur, accès à la comptabilité, aux
   justificatifs d'un collègue ou à ses tâches privées.
2. **Un visiteur anonyme.** L'écran mural est publiquement accessible. Toute
   route publique est donc une surface d'exposition directe.
3. **Un document hostile.** Les fichiers déposés (factures scannées, photos de
   reçus, pièces de projet) sont resservis par l'application. Un fichier actif
   s'exécuterait dans son origine, avec la session de qui l'ouvre.

Hors périmètre : un attaquant ayant obtenu la clé de service, ou un accès
physique à une machine déverrouillée.

## Ce qui protège quoi

### Authentification et rôles

L'identité vient du JWT Supabase, vérifié à chaque requête serveur
(`lib/requireAdmin.js`). Jamais d'un champ du corps de la requête, jamais d'un
en-tête modifiable, jamais du nom d'utilisateur affiché.

Le rôle vit dans `profiles.role` (`member` | `admin` | `display`). Il était
autrefois déduit du nom « Guillaume » et de l'adresse e-mail : renommer un
profil changeait alors ses permissions.

- `requireUser` — compte connecté
- `requireAdmin` — rôle `admin`
- `requireCronOrAdmin` — secret cron (comparé à temps constant) ou rôle `admin`

Le masquage d'un bouton ou une redirection React **ne sont pas** des mesures de
sécurité. `useIsAdmin` sert à l'affichage ; l'autorisation se décide côté
serveur.

### Surface publique

Une seule route sans JWT renvoie des données : `/api/display-projects`, pour la
TV de l'atelier. Elle expose une liste blanche de neuf colonnes, gardée par
`tests/displayProjects.test.js`. `/api/health` ne renvoie ni version, ni
schéma ; `/api/warmup` ne renvoie rien.

`tests/rbac.test.js` tient l'inventaire des routes API : il échoue si une route
apparaît sans contrôle, si une route sensible est rétrogradée, si un secret
revient à une comparaison `===`, si l'admin est de nouveau accordé sur un nom,
si une route renvoie le message brut d'un fournisseur, ou si elle écrit le
corps de la requête en bloc.

### Fichiers

`lib/fileType.js` décide du type à partir du **contenu binaire**, jamais du
type MIME, de l'extension ou de la taille annoncés. PDF, JPEG, PNG, WebP et
HEIC sont acceptés ; HTML, SVG et tout format inconnu sont refusés en 415.

Seules les images raster vérifiées sont servies `inline`. Tout le reste part en
`attachment`, avec `X-Content-Type-Options: nosniff`. Le HEIC est stocké mais
jamais servi inline.

Un identifiant kDrive venu du navigateur n'est pas une autorisation : le
serveur détient un jeton très privilégié. Soit le fichier est référencé en base
et `lib/kdriveAccess.js` tranche, soit il présente un jeton signé
(`lib/signedRef.js`, expiration 1 h) que le serveur a lui-même émis en le
listant. Les pièces comptables sont réservées à l'admin, les frais à leur
auteur. Un refus renvoie 404, jamais 403 : un 403 confirmerait l'existence.

### Données au repos côté navigateur

Le cache SWR est **en mémoire**. Il a été persisté en entier dans le
localStorage, ce qui y laissait factures, transactions bancaires, contacts,
frais et marges, survivant à la déconnexion sur des postes partagés. La clé
héritée `maze-swr-cache` est effacée au démarrage et à la déconnexion.

### Intégrité financière

Les opérations multi-tables passent par des fonctions PostgreSQL
(`reconcile_match`, `next_invoice_number`) : deux `UPDATE` successifs depuis
l'application ne sont pas atomiques, et un `SELECT max + 1` n'est pas
concurrent. Des index uniques interdisent qu'une facture soit payée par deux
transactions, ou qu'un trimestre de stockage soit facturé deux fois.

Les montants d'une facture sont recalculés côté serveur depuis son
`quote_snapshot` (`lib/invoiceCheck.js`) et refusés au-delà d'un centime
d'écart. Une facture envoyée ou payée s'annule, ne se supprime pas.

### Erreurs et journalisation

Le navigateur reçoit un code stable, un message en français et un identifiant
de requête. Le détail — messages Supabase ou kDrive, noms de colonnes,
contraintes — reste dans les logs serveur (`lib/apiError.js`), après nettoyage
des jetons, IBAN et valeurs longues.

### Appels sortants

Tout appel externe a un délai maximal (`lib/fetchTimeout.js`) : 20 s, 120 s
pour l'OCR. Sans lui, une dépendance muette immobilise la fonction serverless
jusqu'à son plafond.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` contourne RLS. Elle ne doit jamais être préfixée
  `NEXT_PUBLIC_`, ni apparaître dans un log, ni transiter par le navigateur.
- **Aucun jeton dans l'URL du remote git.** Un PAT écrit dans `.git/config` s'y
  trouve en clair, part dans toute copie du dépôt et n'expire pas. Utiliser SSH.
- `npm run check:secrets` balaie les fichiers suivis ; il tourne en CI.
- Si un secret a été poussé : le faire tourner **d'abord**, nettoyer
  l'historique ensuite. L'ordre inverse laisse une fenêtre exploitable.

## Données envoyées à Anthropic

L'OCR transmet l'image ou le PDF d'une facture fournisseur ou d'un reçu ; le
résumé de visite transmet les notes saisies, qui peuvent contenir une adresse
et un nom de contact. Ces documents ne sont ni journalisés, ni conservés hors
de kDrive. Le résultat de l'OCR passe toujours par une validation humaine avant
enregistrement.

## Ce qui reste ouvert

- Les fichiers utilisateurs sont servis depuis l'origine de l'application. Une
  origine dédiée, sans cookie de session, serait plus sûre.
- L'écran mural reste accessible sans identification. Un jeton d'appareil en
  cookie `HttpOnly` demande une décision produit.
- Pas d'envoi d'e-mail idempotent : un envoi Resend réussi dont la mise à jour
  de statut échoue peut être renvoyé.
- Pas de limitation de débit sur les routes d'OCR.
