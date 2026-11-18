# Restaurant PWA — Architecture serveur

## Objectif

Fournir une authentification administrateur et des fonctions
de sauvegarde/restauration sans compromettre le fonctionnement
hors ligne de la prise de commandes.

## Frontend

- React, TypeScript et Vite.
- Stockage opérationnel local : IndexedDB / Dexie.
- L'enregistrement des commandes ne dépend pas de l'API.
- Application servie sous /restaurant/.

## Backend

- Node.js 22.
- Express et TypeScript.
- Répertoire source : server/.
- Écoute prévue : 127.0.0.1:4601.
- API dédiée exclusivement au restaurant.

## Base de données

- PostgreSQL 17 existant.
- Base dédiée : restaurant_app.
- Rôle dédié : restaurant_app.
- Aucune permission sur les bases des autres projets.
- Migrations propres au restaurant.

## Isolation système

- Service backend : restaurant-api.service.
- Pas d'exécution de l'API en root.
- Secrets hors du dépôt Git.
- Permissions restrictives.
- Pas de modification des services voisins.

## Déploiement

- Sources : /home/debian/restaurant-pwa.
- Frontend : /var/www/restaurant-pwa.
- Reverse proxy Nginx configuré pour /restaurant/.
- Service backend : restaurant-api.service.

## Règles de sécurité

- Un seul administrateur.
- Mot de passe stocké sous forme de hachage robuste.
- Sessions sécurisées.
- Authentification côté serveur.
- Validation des données entrantes.
- Protection contre les tentatives répétées.
- Aucune donnée sensible dans les journaux.

## Hors ligne

- Catalogue, brouillons et commandes restent utilisables
  sans connexion réseau.
- L'indisponibilité du serveur n'empêche pas
  l'enregistrement local d'une commande.
- Sauvegarde et restauration nécessitent une connexion.
- Aucune synchronisation automatique implicite.

## État actuel

Le backend dispose de routes d’authentification
et de sauvegarde avec des repositories PostgreSQL.

La prise de commandes et la caisse restent
utilisables hors ligne grâce à IndexedDB.
