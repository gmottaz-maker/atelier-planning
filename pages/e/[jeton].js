// La vue rapide : ce qu'on voit après avoir scanné le QR d'une carte Kanban.
//
// Objectif UX du brief, et la seule chose à ne pas perdre de vue ici :
// SCAN + UNE ACTION. Pas de menu, pas de barre latérale, pas d'onglet — quatre
// gros boutons au pouce, et c'est fini. Tout ce qui ne sert pas à ça descend
// sous la ligne de flottaison.
//
// L'adresse est courte (`/e/<jeton>`) parce qu'elle est encodée dans un QR
// imprimé à 20 mm : `/outils/economat/article/<jeton>` ferait soixante-dix
// signes et obligerait à grossir le QR sur une carte déjà chargée.
//
// Ouvrir « Commander » NE CHANGE PAS l'état : on consulte souvent une fiche
// produit sans rien commander.
import { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import { ETATS, etatInfo, couleurDe, categorieDe, lienCommande, enRetard, nomFournisseur } from '../../lib/economat'

const jour = s => {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function VueRapide() {
  const router = useRouter()
  const { jeton } = router.query
  const { data, error, mutate } = useSWR(jeton ? `/api/economat/fiche?jeton=${encodeURIComponent(jeton)}` : null)
  const [enCours, setEnCours] = useState('')
  const [souci, setSouci] = useState('')

  const article = data?.article
  const categories = data?.categories || []
  const fournisseurs = data?.fournisseurs || []

  async function basculer(etat) {
    setEnCours(etat); setSouci('')
    try {
      const maj = await apiFetch('/api/economat/etat', { method: 'POST', json: { jeton, etat }, silencieux: true })
      // On réécrit localement plutôt que de recharger : le téléphone est
      // souvent au fond de l'atelier, et l'écran doit répondre tout de suite.
      mutate({ ...data, article: { ...article, ...maj } }, { revalidate: true })
    } catch (e) { setSouci(e.message) } finally { setEnCours('') }
  }

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
  const commander = lienCommande(article, fournisseurs)
  const retard = enRetard(article)
  const chezQui = nomFournisseur(article.fournisseur_id, fournisseurs)

  return (
    <>
      <Head>
        <title>{article.designation} · Économat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div style={{ minHeight: '100vh', background: C.surface, fontFamily: FONT }}>
        {/* Le bandeau reprend la couleur du bandeau de la carte en papier :
            on doit reconnaître au premier coup d'œil qu'on est sur le bon
            article, sans lire. */}
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

          {retard && (
            <p style={{
              font: `13px ${FONT}`, color: C.danger, background: C.dangerBg, borderRadius: R.panel,
              padding: '8px 12px', margin: '12px 0 0',
            }}>
              Commandé le {jour(article.etat_le)} — au-delà du délai habituel ({article.delai_jours} j).
            </p>
          )}

          {/* L'ACTION PRINCIPALE, tout de suite et sans rien avant. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
            {ETATS.map(e => {
              const actif = article.etat === e.cle
              return (
                <button
                  key={e.cle}
                  onClick={() => basculer(e.cle)}
                  disabled={!!enCours}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '18px 8px', borderRadius: R.panel, cursor: 'pointer',
                    border: `1.5px solid ${actif ? C.outline : C.border}`,
                    background: actif ? AL.black : C.surface,
                    color: actif ? AL.white : AL.black,
                    font: `${actif ? 500 : 400} 14px ${FONT}`,
                    opacity: enCours && enCours !== e.cle ? .5 : 1,
                  }}
                >
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{e.emoji}</span>
                  {e.libelle}
                </button>
              )
            })}
          </div>
          {souci && <p style={{ font: `13px ${FONT}`, color: C.danger, marginTop: 10 }}>{souci}</p>}

          {commander && (
            <a href={commander} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center', marginTop: 12, padding: '15px 18px',
                borderRadius: R.pill, border: `1.5px solid ${C.outline}`, background: C.surface,
                font: `500 15px ${FONT}`, color: AL.black, textDecoration: 'none',
              }}>
              Commander chez {chezQui || 'le fournisseur'} ↗
            </a>
          )}

          {/* Tout le reste, en dessous : utile, mais jamais devant l'action. */}
          <dl style={{ margin: '28px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Info cle="Fournisseur" valeur={chezQui} />
            <Info cle="Référence" valeur={article.reference} mono />
            <Info cle="Emplacement" valeur={article.emplacement} />
            <Info cle="Seuil stock bas" valeur={article.seuil_bas} />
            <Info cle="Seuil à commander" valeur={article.seuil_commander} />
            <Info cle="Quantité à commander" valeur={article.quantite_commande} />
            <Info cle="Délai habituel" valeur={article.delai} />
            <Info cle="Fournisseur alternatif" valeur={nomFournisseur(article.fournisseur_alt_id, fournisseurs)} />
            <Info cle="Notes" valeur={article.notes} />
          </dl>

          {(data.commandes || []).length > 0 && (
            <div style={{ marginTop: 28, borderTop: `1px solid ${C.divider}`, paddingTop: 16 }}>
              <p style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
                Dernières commandes
              </p>
              {data.commandes.map(c => (
                <p key={c.id} style={{ font: `13px ${FONT}`, color: C.muted, margin: '0 0 4px' }}>
                  {jour(c.commande_le)}{c.quantite ? ` · ${c.quantite}` : ''}{c.par ? ` · ${c.par}` : ''}
                  {c.recu_le ? ` · reçu le ${jour(c.recu_le)}` : ' · en attente'}
                </p>
              ))}
            </div>
          )}

          <p style={{ font: `12px ${FONT}`, color: C.muted, marginTop: 28 }}>
            État actuel : {etatInfo(article.etat).emoji} {etatInfo(article.etat).libelle}
            {article.etat_le ? ` depuis le ${jour(article.etat_le)}` : ''}
          </p>
        </div>
      </div>
    </>
  )
}

function Info({ cle, valeur, mono }) {
  // Un champ vide ne laisse pas un label orphelin : la moitié des colonnes du
  // fichier repris de Numbers sont vides, et afficher « Emplacement : — »
  // huit fois d'affilée noierait ce qui est renseigné.
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
