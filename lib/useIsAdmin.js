import { useAuth } from '../pages/_app'

export const ADMIN_USER  = 'Guillaume'
export const ADMIN_EMAIL = 'guillaume@amazinglab.ch'

// Le rôle fait autorité (colonne `profiles.role`), mais il est lu en asynchrone
// après l'ouverture de session : au premier rendu il n'est pas encore là. Sans
// repli, le garde-fou des pages admin (`if (user && !isAdmin) router.replace('/')`)
// renverrait à l'accueil au moindre rechargement complet — le bug déjà rencontré
// avec le nom. Le repli sur l'e-mail ne couvre donc que cette fenêtre ; il ne
// sert plus dès que le rôle est chargé (_app.js le met aussi en cache local).
//
// Ce hook ne protège rien : il masque de l'interface. L'autorisation réelle est
// vérifiée côté serveur par requireAdmin.
export default function useIsAdmin() {
  const { user } = useAuth() || {}
  if (!user) return false
  if (user.role) return user.role === 'admin'
  return user.name === ADMIN_USER || user.email === ADMIN_EMAIL
}
