import express from 'express'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.json({
      service: 'restaurant-api',
      status: 'ok',
    })
  })

  // Fermées jusqu'à l'authentification et aux contrôles
  // d'autorisation des prochaines étapes.
  app.all(['/auth/*path', '/backups/*path'], (
    _request,
    response,
  ) => {
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
