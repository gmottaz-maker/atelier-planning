import useSWR from 'swr'
import { normaliserTransport } from './transport'

// Véhicules et forfaits de ville (lib/transport.js). Lisible par tous : les
// noms et les prix de vente, jamais les coûts — ceux-là passent par la clé
// `couts_vehicules`, réservée à l'admin.
export function useTransport() {
  const { data } = useSWR('/api/app-settings/transport')
  return normaliserTransport(data?.value)
}
