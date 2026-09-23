// Index des outils d'atelier.
//
// Ces outils n'ont aucun lien avec les projets, les devis ou la comptabilité :
// ce sont des aides au travail, pas des données d'entreprise. Ils sont donc
// regroupés à part, et chacun reste autonome.
import Head from 'next/head'
import Link from 'next/link'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
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
    href: '/outils/annuaire',
    nom: 'Annuaire',
    resume: 'Qui fait quoi, et où l’on commande : tôlerie, thermolaquage, fraises de CNC, filtres du mur aspirant. Rangé par technique, jamais par région — et une entrée peut n’être qu’un nom et un site.',
    etat: 'atelier',
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
  const visibles = OUTILS.filter(o => !o.admin || isAdmin)

  return (
    <>
      <Head><title>Outils · Maze Project</title></Head>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 64px' }}>

        <h1 style={{ font: `500 38px ${FONT}`, lineHeight: 1.05, letterSpacing: '-.01em', color: AL.black, margin: 0 }}>
          Outils
        </h1>
        <p style={{ font: `18px ${FONT}`, color: C.muted, margin: '12px 0 28px' }}>
          {visibles.length} aides au travail d’atelier. Autonomes, sans lien avec les projets ni la facturation.
        </p>

        {/* Une carte par outil, deux colonnes dès qu'il y a la place. Le nom en
            grand, le sujet en petites capitales au-dessus, la raison d'être en
            dessous : c'est elle qu'on lit pour savoir si c'est le bon outil.
            Au survol, la carte s'inverse — la seule profondeur de la marque. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {visibles.map(o => (
            // LE LIEN EST LA CARTE. Un premier essai posait un <article> en
            // `height: 100%` DANS le lien : une hauteur en pourcentage n'a rien
            // à quoi se résoudre quand le parent est libre, le contenu passait
            // sous la grille et chevauchait la ligne suivante.
            <Link
              key={o.href}
              href={o.href}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none',
                border: `1.5px solid ${C.outline}`, borderRadius: R.panel,
                padding: '20px 22px 22px', background: C.surface, transition: 'background .15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = AL.black
                e.currentTarget.querySelectorAll('[data-encre]').forEach(x => { x.style.color = AL.white })
                e.currentTarget.querySelectorAll('[data-discret]').forEach(x => { x.style.color = C.navInactive })
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = C.surface
                e.currentTarget.querySelectorAll('[data-encre]').forEach(x => { x.style.color = AL.black })
                e.currentTarget.querySelectorAll('[data-discret]').forEach(x => { x.style.color = C.muted })
              }}
            >
              <span data-discret style={{
                display: 'flex', alignItems: 'center', gap: 7, font: `500 10.5px ${MONO}`,
                letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted,
              }}>
                {/* Un point corail pour ce qui n'est visible que de l'admin :
                    ces écrans portent des coûts et des marges. */}
                {o.admin && <span style={{ width: 6, height: 6, borderRadius: R.pill, background: C.accent, flex: 'none' }} />}
                {o.etat}
              </span>

              <span data-encre style={{ font: `500 21px ${FONT}`, lineHeight: 1.2, color: AL.black }}>{o.nom}</span>

              <span data-discret style={{ font: `13.5px ${FONT}`, color: C.muted, lineHeight: 1.6, marginTop: 2 }}>
                {o.resume}
              </span>
            </Link>
          ))}
        </div>

        <p style={{ font: `12.5px ${FONT}`, color: C.muted, marginTop: 32, lineHeight: 1.7 }}>
          Pour en ajouter un : une page sous
          <code style={{ fontFamily: MONO, fontSize: 12 }}> pages/outils/</code>, une entrée dans la liste
          de ce fichier, et le calcul dans <code style={{ fontFamily: MONO, fontSize: 12 }}>lib/</code> pour
          qu’il soit testable sans écran.
        </p>
      </div>
    </>
  )
}
