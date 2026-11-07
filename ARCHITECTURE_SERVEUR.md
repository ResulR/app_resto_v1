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
- Écoute prévue : 127.0.0.1:4600.
- API dédiée exclusivement au restaurant.

## Base de données

- PostgreSQL 17 existant.
- Base dédiée prévue : restaurant_app.
- Rôle dédié prévu : restaurant_app.
- Aucune permission sur les bases des autres projets.
- Migrations propres au restaurant.

## Isolation système

- Compte système dédié prévu : restaurant-app.
- Pas d'exécution de l'API en root.
- Secrets hors du dépôt Git.
- Permissions restrictives.
- Pas de modification des services voisins.

## Déploiement

- Sources : /home/debian/restaurant-pwa.
- Frontend : /var/www/restaurant-pwa.
- Reverse proxy à configurer ultérieurement.
- Aucun changement Nginx dans le point 7.1.
- Aucun service créé dans le point 7.1.

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

## Étape suivante

Point 7.2 : développer l'API minimale et les migrations
PostgreSQL dans un environnement isolé.

Les comptes système, la base réelle et le déploiement
seront préparés séparément après contrôle des permissions.
