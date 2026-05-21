import { useAuth } from '../pages/_app'

export const ADMIN_USER = 'Guillaume'

export default function useIsAdmin() {
  const { user } = useAuth() || {}
  return user?.name === ADMIN_USER
}
