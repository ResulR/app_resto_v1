import { db } from '../../shared/database/db'

export type PrinterMode = 'disabled' | 'browser'

const KEY = 'printer-mode'

export async function getPrinterMode(): Promise<PrinterMode> {
  const setting = await db.settings.get(KEY)

  return setting?.value === 'browser'
    ? 'browser'
    : 'disabled'
}

export async function setPrinterMode(
  mode: PrinterMode,
): Promise<void> {
  if (mode !== 'disabled' && mode !== 'browser') {
    throw new Error('Mode d’impression invalide.')
  }

  await db.settings.put({
    key: KEY,
    value: mode,
  })
}
