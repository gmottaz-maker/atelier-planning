// La vue rapide : ce qu'on voit après avoir scanné le QR d'une carte Kanban.
//
// Brief V2, §11 : « scanner → voir le niveau actuel → faire une action →
// terminé ». Pas de menu, pas de barre latérale, pas de fiche catalogue
// complète : on est devant la boîte, la carte à la main. Tout ce qui ne sert
// pas au geste descend sous la ligne de flottaison.
//
// Trois cas :
//  - article configuré : le niveau, le geste, le réapprovisionnement ;
//  - article pas encore configuré (repris de V1) : une invite à compléter la
//    fiche, et rien d'autre — décision du 5 octobre 2026 ;
//  - référence uniquement : pas de stock (§3.2), seulement l'identification.
//
// L'adresse est courte (`/e/<jeton>`) parce qu'elle est encodée dans un QR
// imprimé à 20 mm : `/outils/economat/article/<jeton>` ferait soixante-dix
// signes et obligerait à grossir le QR sur une carte déjà chargée.
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import {
  couleurDe, categorieDe, nomFournisseur, nomEntree, estConfigure, libelleMouvement, quand, lienCommande,
} from '../../lib/economat'
import EconomatGestes from '../../components/EconomatGestes'

export default function VueRapide() {
  const router = useRouter()
  const { jeton } = router.query
  const { data, error, mutate } = useSWR(jeton ? `/api/economat/fiche?jeton=${encodeURIComponent(jeton)}` : null)

  const article = data?.article
  const categories = data?.categories || []
  const fournisseurs = data?.fournisseurs || []
  const unites = data?.unites || []

  if (error) {
    return (
      <Cadre>
        <p style={{ font: `16px ${FONT}`, color: C.muted }}>
          {error.status === 404 ? 'Cette carte ne correspond à aucun article.' : 'Lecture impossible.'}
        </p>
      </Cadre>
    )
  }
  if (!article) return <Cadre><p style={{ font: `15px ${FONT}`, color: C.muted }}>Lecture…</p></Cadre>

  const couleur = couleurDe(article, categories)
  const { feuille, racine } = categorieDe(article, categories)
  const nomCat = [racine?.nom, feuille && feuille.id !== racine?.id ? feuille.nom : null].filter(Boolean).join(' · ')
  const reference = article.type === 'reference'
  const configure = estConfigure(article)
  const chezQui = nomFournisseur(article.fournisseur_id, fournisseurs)

  // Après un geste, la route renvoie l'article à jour : on le réécrit
  // localement plutôt que de tout relire — le téléphone est souvent au fond
  // de l'atelier. L'historique se relit ensuite, sans bloquer l'écran.
  const maj = partiel => mutate({ ...data, article: { ...article, ...partiel } }, { revalidate: true })

  return (
    <>
      <Head>
        <title>{article.designation} · Économat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div style={{ minHeight: '100vh', background: C.surface, fontFamily: FONT }}>
        {/* Le bandeau reprend la couleur de la carte en papier : on reconnaît
            qu'on est sur le bon article sans lire. */}
        <div style={{ background: couleur, padding: '14px 18px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ font: `500 11px ${MONO}`, letterSpacing: '.09em', textTransform: 'uppercase', color: AL.black }}>
              {nomCat || 'sans catégorie'}
            </span>
            <span style={{ font: `500 11px ${MONO}`, color: AL.black, flex: 'none' }}>{article.code}</span>
          </div>
        </div>

        <div style={{ padding: '18px 18px 40px', maxWidth: 560, margin: '0 auto' }}>
          <h1 style={{ font: `500 28px ${FONT}`, lineHeight: 1.15, letterSpacing: '-.01em', color: AL.black, margin: 0 }}>
            {article.designation}
          </h1>
          {article.sous_titre && (
            <p style={{ font: `17px ${FONT}`, color: C.muted, margin: '4px 0 0' }}>{article.sous_titre}</p>
          )}

          <div style={{ marginTop: 22 }}>
            {reference && (
              <p style={{ font: `15px ${FONT}`, color: C.muted, margin: 0 }}>
                Référence uniquement : cet article n’est pas suivi en stock.
              </p>
            )}

            {!reference && !configure && (
              <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: R.panel, padding: 18 }}>
                <p style={{ font: `500 17px ${FONT}`, color: AL.black, margin: '0 0 6px' }}>Stock pas encore configuré</p>
                <p style={{ font: `14px ${FONT}`, color: C.muted, margin: '0 0 14px' }}>
                  Choisis le mode de suivi, l’unité, le stock cible et les seuils dans la fiche de l’article.
                  Le QR servira ensuite à suivre le stock.
                </p>
                <Link href={`/outils/economat?article=${article.id}`} style={{
                  display: 'block', textAlign: 'center', padding: '15px 18px', borderRadius: R.pill,
                  background: AL.black, color: AL.white, font: `500 15px ${FONT}`, textDecoration: 'none',
                }}>
                  Configurer l’article
                </Link>
              </div>
            )}

            {!reference && configure && (
              <EconomatGestes article={article} unites={unites} fournisseurs={fournisseurs} onMaj={maj} grand />
            )}
          </div>

          {/* Tout le reste, en dessous : utile, mais jamais devant le geste. */}
          <dl style={{ margin: '30px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Info cle="Emplacement" valeur={nomEntree(article.emplacement_id, data.emplacements)} />
            <Info cle="Fournisseur" valeur={chezQui} />
            <Info cle="Référence" valeur={article.reference} mono />
            <Info cle="Délai habituel" valeur={nomEntree(article.delai_id, data.delais)} />
            <Info cle="Fournisseur alternatif" valeur={nomFournisseur(article.fournisseur_alt_id, fournisseurs)} />
            <Info cle="Notes" valeur={article.notes} />
          </dl>
          {reference && lienCommande(article, fournisseurs) && (
            <a href={lienCommande(article, fournisseurs)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 14, font: `14px ${FONT}`, color: AL.black }}>
              Fiche chez {chezQui || 'le fournisseur'} ↗
            </a>
          )}

          {(data.mouvements || []).length > 0 && (
            <div style={{ marginTop: 28, borderTop: `1px solid ${C.divider}`, paddingTop: 16 }}>
              <p style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
                Derniers gestes
              </p>
              {data.mouvements.map(m => (
                <p key={m.id} style={{
                  font: `13px ${FONT}`, color: C.muted, margin: '0 0 4px',
                  textDecoration: m.annule_le ? 'line-through' : 'none',
                }}>
                  {quand(m.le)} · {libelleMouvement(m, article, unites)}{m.par ? ` · ${m.par}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Info({ cle, valeur, mono }) {
  // Un champ vide ne laisse pas un label orphelin.
  if (!String(valeur || '').trim()) return null
  return (
    <div>
      <dt style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>{cle}</dt>
      <dd style={{ font: `${mono ? `14px ${MONO}` : `15px ${FONT}`}`, color: AL.black, margin: '2px 0 0' }}>{valeur}</dd>
    </div>
  )
}

function Cadre({ children }) {
  return (
    <>
      <Head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.surface }}>
        {children}
      </div>
    </>
  )
}
