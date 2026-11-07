# Restaurant API

Backend interne dédié au restaurant.

## Développement

npm install
npm test
npm run build

## Sécurité

- Écoute locale uniquement : 127.0.0.1:4600.
- Aucun compte administrateur provisionné.
- Aucune route de sauvegarde ou d'authentification activée.
- Ne pas exposer l'API à Internet avant sécurisation.
- Ne pas appliquer les migrations aux bases des autres projets.

## Base

Les migrations sont dans migrations/.

La migration 001_initial.sql est destinée exclusivement
à une base PostgreSQL dédiée `restaurant_app`.

La création du rôle, de la base et l'application des
migrations seront réalisées dans une étape contrôlée.

## Hors ligne

La prise de commandes continue à utiliser IndexedDB.
Le serveur ne participe pas à la validation locale.
