export function printTicket(text: string): void {
  if (!text.trim()) {
    throw new Error('Ticket vide.')
  }

  const popup = window.open('', '_blank')

  if (!popup) {
    throw new Error(
      'Fenêtre d’impression bloquée par le navigateur.',
    )
  }

  // textContent protège contre l'injection HTML.
  const document = popup.document
  document.open()
  document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Ticket de préparation</title>
<style>
@page { size: 80mm auto; margin: 3mm; }
body { margin: 0; padding: 5mm; color: #000; }
pre {
  font: 12px/1.45 monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media screen {
  body { max-width: 80mm; margin: 20px auto; }
}
</style>
</head>
<body><pre id="ticket"></pre></body>
</html>`)
  document.close()

  const content = document.getElementById('ticket')

  if (!content) {
    popup.close()
    throw new Error('Impossible de préparer le ticket.')
  }

  content.textContent = text

  // L'impression doit rester déclenchée par une action utilisateur.
  popup.focus()
  popup.print()
}
