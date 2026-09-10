import { describe, it, expect } from 'vitest'
import {
  extraireUrl, estSeulementUnLien, adressePrivee, urlAcceptable,
  hoteJoignable, extraireTexte, lireLien,
} from '../lib/lienExterne'

describe('extraireUrl', () => {
  it('trouve un lien au milieu d\'une phrase', () => {
    expect(extraireUrl('voir https://exemple.ch/a pour le détail')).toBe('https://exemple.ch/a')
  })
  it('laisse la ponctuation finale hors du lien', () => {
    expect(extraireUrl('cf https://exemple.ch/page.')).toBe('https://exemple.ch/page')
    expect(extraireUrl('(https://exemple.ch/a)')).toBe('https://exemple.ch/a')
  })
  it('rend null sans lien', () => {
    expect(extraireUrl('rien ici')).toBe(null)
    expect(extraireUrl('')).toBe(null)
  })
})

describe('estSeulementUnLien', () => {
  it('distingue le dépôt d\'un lien de la note qui en cite un', () => {
    expect(estSeulementUnLien('https://exemple.ch/a')).toBe(true)
    expect(estSeulementUnLien('  https://exemple.ch/a  ')).toBe(true)
    expect(estSeulementUnLien('voir https://exemple.ch/a')).toBe(false)
    expect(estSeulementUnLien('une note')).toBe(false)
  })
})

describe('adressePrivee', () => {
  it('refuse les plages internes', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255',
                      '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1']) {
      expect(adressePrivee(ip), ip).toBe(true)
    }
  })
  it('refuse le service de métadonnées cloud', () => {
    expect(adressePrivee('169.254.169.254')).toBe(true)
  })
  it('accepte les adresses publiques', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1']) {
      expect(adressePrivee(ip), ip).toBe(false)
    }
  })
  it('gère l\'IPv6, y compris l\'IPv4 encapsulée', () => {
    expect(adressePrivee('::1')).toBe(true)
    expect(adressePrivee('fd00::1')).toBe(true)
    expect(adressePrivee('fe80::1')).toBe(true)
    expect(adressePrivee('::ffff:10.0.0.1')).toBe(true)
    expect(adressePrivee('2001:4860:4860::8888')).toBe(false)
  })
  it('refuse ce qu\'elle ne comprend pas', () => {
    expect(adressePrivee('')).toBe(true)
    expect(adressePrivee('pas-une-ip')).toBe(true)
  })
})

describe('urlAcceptable', () => {
  it('refuse les schémas autres que http/https', () => {
    expect(urlAcceptable('file:///etc/passwd').ok).toBe(false)
    expect(urlAcceptable('gopher://x/1').ok).toBe(false)
    expect(urlAcceptable('javascript:alert(1)').ok).toBe(false)
  })
  it('refuse un port inhabituel', () => {
    expect(urlAcceptable('http://exemple.ch:5432/').ok).toBe(false)
    expect(urlAcceptable('https://exemple.ch:443/').ok).toBe(true)
  })
  it('accepte un lien ordinaire', () => {
    expect(urlAcceptable('https://exemple.ch/page').ok).toBe(true)
  })
})

describe('hoteJoignable', () => {
  const resout = map => async (nom) => map[nom] || Promise.reject(new Error('NXDOMAIN'))

  it('refuse un domaine qui pointe vers le réseau interne', async () => {
    const r = await hoteJoignable('interne.test', resout({ 'interne.test': [{ address: '10.0.0.5' }] }))
    expect(r.ok).toBe(false)
  })
  it('refuse même si UNE SEULE adresse est privée', async () => {
    const r = await hoteJoignable('mixte.test',
      resout({ 'mixte.test': [{ address: '8.8.8.8' }, { address: '127.0.0.1' }] }))
    expect(r.ok).toBe(false)
  })
  it('accepte un domaine public', async () => {
    const r = await hoteJoignable('exemple.ch', resout({ 'exemple.ch': [{ address: '8.8.8.8' }] }))
    expect(r.ok).toBe(true)
  })
  it('refuse un domaine introuvable', async () => {
    const r = await hoteJoignable('nulle-part.test', resout({}))
    expect(r.ok).toBe(false)
  })
})

describe('extraireTexte', () => {
  it('sort le titre et le texte lisible', () => {
    const { titre, texte } = extraireTexte(
      '<html><head><title> Le devis </title></head><body><p>Bonjour&nbsp;&amp; merci</p></body></html>')
    expect(titre).toBe('Le devis')
    expect(texte).toContain('Bonjour & merci')
  })
  it('jette le script et le style', () => {
    const { texte } = extraireTexte('<style>a{}</style><script>vole()</script><p>vrai contenu</p>')
    expect(texte).toBe('vrai contenu')
  })
  it('supporte un HTML vide', () => {
    expect(extraireTexte('')).toEqual({ titre: null, texte: null })
  })
})

describe('lireLien', () => {
  const publique = async () => [{ address: '8.8.8.8' }]
  const reponse = (corps, { status = 200, type = 'text/html', location } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: k => (k === 'content-type' ? type : k === 'location' ? location : null) },
    text: async () => corps,
  })

  it('rend titre et extrait', async () => {
    const r = await lireLien('https://exemple.ch/a', {
      resoudre: publique,
      fetcher: async () => reponse('<title>Offre 2026</title><p>Montage le 4 septembre</p>'),
    })
    expect(r.titre).toBe('Offre 2026')
    expect(r.extrait).toContain('Montage le 4 septembre')
    expect(r.raison).toBe(null)
  })

  it('ne suit pas une redirection vers le réseau interne', async () => {
    let appels = 0
    const r = await lireLien('https://exemple.ch/a', {
      resoudre: async (nom) => {
        if (nom === 'exemple.ch') return [{ address: '8.8.8.8' }]
        return [{ address: '169.254.169.254' }]
      },
      fetcher: async () => {
        appels += 1
        return reponse('', { status: 302, location: 'http://metadata.interne/latest/meta-data/' })
      },
    })
    expect(r.extrait).toBe(null)
    expect(r.raison).toBe('Adresse interne refusée')
    expect(appels).toBe(1)
  })

  it('n\'appelle rien pour un schéma refusé', async () => {
    let appels = 0
    const r = await lireLien('file:///etc/passwd', {
      resoudre: publique,
      fetcher: async () => { appels += 1; return reponse('') },
    })
    expect(appels).toBe(0)
    expect(r.raison).toBe('Seuls les liens http et https sont acceptés')
  })

  it('refuse une page non textuelle', async () => {
    const r = await lireLien('https://exemple.ch/x.zip', {
      resoudre: publique,
      fetcher: async () => reponse('PK', { type: 'application/zip' }),
    })
    expect(r.raison).toBe('Page non textuelle')
  })

  it('garde le lien même quand la page est injoignable', async () => {
    const r = await lireLien('https://exemple.ch/a', {
      resoudre: publique,
      fetcher: async () => { throw new Error('ECONNREFUSED') },
    })
    expect(r.url).toBe('https://exemple.ch/a')
    expect(r.raison).toBe('Page injoignable')
  })
})
