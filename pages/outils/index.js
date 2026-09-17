// Index des outils d'atelier.
//
// Ces outils n'ont aucun lien avec les projets, les devis ou la comptabilité :
// ce sont des aides au travail, pas des données d'entreprise. Ils sont donc
// regroupés à part, et chacun reste autonome.
import Head from 'next/head'
import Link from 'next/link'
import { C, FONT, MONO, R } from '../../lib/theme'
import useIsAdmin from '../../lib/useIsAdmin'

const OUTILS = [
  {
    href: '/outils/peintures',
    nom: 'Peintures RUCO',
    resume: 'Choisir un produit selon le support, la brillance et le mode d’application, puis chiffrer le travail : quantités, durcisseur, diluant, coût matière et temps.',
    etat: '271 produits · 20 tarifés',
  },
  {
    href: '/outils/charges-sociales',
    nom: 'Charges sociales',
    resume: 'Ce qu’un employé coûte vraiment : AVS, chômage, allocations familiales, accidents (LAA) et prévoyance (LPP), par personne et par organisme. Ce qui est prélevé sans qu’on ait le choix.',
    etat: 'admin',
    admin: true,
  },
  {
    href: '/outils/assurances',
    nom: 'Assurances',
    resume: 'Ce qu’on a choisi d’assurer — perte de gain, RC, biens, véhicules — et surtout ce qui est couvert. Une question en une phrase, « on m’a volé de l’outillage sur un chantier », renvoie la garantie, sa limite et qui appeler.',
    etat: 'admin',
    admin: true,
  },
  {
    href: '/outils/marge-km',
    nom: 'Marge au kilomètre',
    resume: 'Un trajet gagne-t-il de l’argent ? Le kilomètre et le forfait doivent payer le véhicule et le temps de chaque personne à bord. Essaie un tarif, un salaire ou des km par an sans toucher aux réglages.',
    etat: 'admin',
    admin: true,
  },
]

export default function Outils() {
  const isAdmin = useIsAdmin()
  return (
    <>
      <Head><title>Outils · Maze Project</title></Head>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 48px' }}>
        <h1 style={{ font: `700 24px ${FONT}`, color: C.ink, margin: '0 0 4px' }}>Outils</h1>
        <p style={{ font: `14px ${FONT}`, color: C.muted, margin: '0 0 24px' }}>
          Aides au travail d’atelier. Autonomes, sans lien avec les projets ni la facturation.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          {OUTILS.filter(o => !o.admin || isAdmin).map(o => (
            <Link key={o.href} href={o.href} style={{ textDecoration: 'none' }}>
              <article style={{
                border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '16px 18px',
                background: C.surface, display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ font: `600 16px ${FONT}`, color: C.ink }}>{o.nom}</span>
                  <span style={{ font: `10px ${MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>{o.etat}</span>
                </div>
                <p style={{ font: `13.5px ${FONT}`, color: C.inkTertiary, margin: 0, lineHeight: 1.6 }}>{o.resume}</p>
              </article>
            </Link>
          ))}
        </div>

        <p style={{ font: `12.5px ${FONT}`, color: C.muted, marginTop: 28, lineHeight: 1.7 }}>
          D’autres outils viendront s’ajouter ici. Pour en créer un : une page sous
          <code style={{ fontFamily: MONO, fontSize: 12 }}> pages/outils/</code>, une entrée dans
          la liste ci-dessus, et le calcul dans <code style={{ fontFamily: MONO, fontSize: 12 }}>lib/</code>
          pour qu’il soit testable.
        </p>
      </div>
    </>
  )
}
