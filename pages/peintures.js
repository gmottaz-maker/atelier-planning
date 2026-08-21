// L'outil a déménagé sous /outils/peintures quand la section « Outils » a été
// créée. Cette redirection garde valides les liens et signets existants.
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function PeinturesRedirection() {
  const router = useRouter()
  useEffect(() => { router.replace('/outils/peintures') }, [router])
  return null
}
