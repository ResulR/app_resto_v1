import type { ConfirmedOrder } from './orderRepository'

export function createPreparationTicket(
  order: ConfirmedOrder,
): string {
  const date = new Date(order.createdAt)

  if (!Number.isFinite(date.getTime())) {
    throw new Error('Date de commande invalide.')
  }

  const lines: string[] = [
    'RESTAURANT',
    'TICKET DE PRÉPARATION',
    '--------------------------------',
    `Commande : ${order.id.toUpperCase()}`,
    `Date : ${date.toLocaleString('fr-BE', {
      dateStyle: 'short',
      timeStyle: 'short',
    })}`,
    `Mode : ${
      order.consumptionMode === 'sur_place'
        ? 'SUR PLACE'
        : order.consumptionMode === 'emporter'
          ? 'À EMPORTER'
          : 'NON PRÉCISÉ'
    }`,
    '--------------------------------',
  ]

  for (const item of order.items) {
    lines.push(`${item.quantity} × ${item.name}`)

    for (const option of item.options) {
      lines.push(
        `  - ${option.groupName} : ${option.name}`,
      )
    }

    if (item.note) {
      lines.push(`  NOTE : ${item.note}`)
    }

    lines.push('')
  }

  if (order.comment) {
    lines.push('--------------------------------')
    lines.push('COMMENTAIRE GÉNÉRAL')
    lines.push(order.comment)
  }

  lines.push('--------------------------------')
  lines.push('FIN DU TICKET')

  return lines.join('\n')
}
