import express from 'express'
import type { Pool } from 'pg'
import { createAuthRouter } from './authRoutes.js'

export function createApp(pool?: Pool) {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.json({
      service: 'restaurant-api',
      status: 'ok',
    })
  })

  if (pool) {
    app.use('/auth', createAuthRouter(pool))
  } else {
    app.all('/auth/*path', (_request, response) => {
      response.status(503).json({
        error: 'Authentification non configurée',
      })
    })
  }

  // Sauvegardes fermées jusqu'à leur sécurisation.
  app.all('/backups/*path', (_request, response) => {
    response.status(501).json({
      error: 'Fonctionnalité non activée',
    })
  })

  app.use((_request, response) => {
    response.status(404).json({
      error: 'Route introuvable',
    })
  })

  return app
}
