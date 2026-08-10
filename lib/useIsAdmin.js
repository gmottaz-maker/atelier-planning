import { useAuth } from '../pages/_app'

export const ADMIN_USER  = 'Guillaume'
// L'admin est identifié par son nom (table `profiles`), mais ce nom n'est lu
// qu'en asynchrone après la session : au chargement, user.name vaut d'abord
// l'e-mail. On reconnaît donc aussi l'admin par son e-mail, disponible dès le
// premier rendu — sinon isAdmin est brièvement faux et le garde-fou des pages
// admin (`if (user && !isAdmin) router.replace('/')`) renvoie à l'accueil au
// moindre rechargement complet (typiquement après un déploiement).
export const ADMIN_EMAIL = 'guillaume@amazinglab.ch'

export default function useIsAdmin() {
  const { user } = useAuth() || {}
  if (!user) return false
  return user.name === ADMIN_USER || user.email === ADMIN_EMAIL
}
