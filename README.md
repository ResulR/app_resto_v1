# Restaurant PWA

Application privée de prise de commandes pour restaurant.

## Architecture
- Frontend : React, TypeScript, Vite.
- Backend : Express, TypeScript, PostgreSQL.
- Stockage opérationnel : IndexedDB / Dexie.
- Fonctionnement offline-first.
- Modules métier : src/features/.
- Backend : server/src/.

## Installation
Frontend : npm ci
Backend : cd server puis npm ci

## Développement
npm run dev

## Vérifications
- Frontend : npm run lint et npm run build.
- Backend : cd server puis npm run build et npm test.
- Tests frontend : Node.js avec tsx et les suites du dépôt.

## Configuration backend
Voir server/.env.example.
Les secrets PostgreSQL restent hors du dépôt.

## Déploiement
- Application publiée sous /restaurant/.
- Backend local derrière Nginx.
- Aucun déploiement automatique après un build.

## Documentation
Voir ARCHITECTURE_SERVEUR.md.
