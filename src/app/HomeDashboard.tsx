import './HomeDashboard.css'

export type HomeDestination =
  | 'orders'
  | 'checkout'
  | 'active'
  | 'history'
  | 'statistics'
  | 'catalogue'
  | 'settings'

const sections: {
  id: HomeDestination
  title: string
  description: string
}[] = [
  { id: 'orders', title: 'Commandes',
    description: 'Créer et préparer une commande' },
  { id: 'checkout', title: 'Encaissement',
    description: 'Paiements et soldes restants' },
  { id: 'active', title: 'En cours',
    description: 'Suivre les commandes actives' },
  { id: 'history', title: 'Historique',
    description: 'Consulter les commandes terminées' },
  { id: 'statistics', title: 'Statistiques',
    description: 'Consulter les résultats' },
  { id: 'catalogue', title: 'Catalogue',
    description: 'Gérer les produits et les options' },
  { id: 'settings', title: 'Paramètres',
    description: 'Compte et configuration' },
]

export function HomeDashboard({
  onNavigate,
}: {
  onNavigate: (destination: HomeDestination) => void
}) {
  return (
    <main className="home-dashboard">
      <header className="home-heading">
        <span>ESPACE RESTAURANT</span>
        <h1>Accueil</h1>
        <p>Choisissez votre espace de travail.</p>
      </header>

      <nav className="home-grid" aria-label="Navigation principale">
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            className="home-tile"
            onClick={() => onNavigate(section.id)}
          >
            <strong>{section.title}</strong>
            <span>{section.description}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}
