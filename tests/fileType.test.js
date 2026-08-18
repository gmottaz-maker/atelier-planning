import { describe, it, expect } from 'vitest'
import { typeReel, validerFichier, nomSur, entetesFichier, TYPES_AUTORISES } from '../lib/fileType'

const pad = (tete, n = 32) => Buffer.concat([Buffer.from(tete), Buffer.alloc(n)])
const PDF  = pad([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const JPEG = pad([0xFF, 0xD8, 0xFF, 0xE0])
const PNG  = pad([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)])
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(20)])
const HTML = Buffer.from('<html><script>fetch("/api/customer-invoices")</script></html>')
const SVG  = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

describe('type réel', () => {
  it('reconnaît les formats autorisés', () => {
    expect(typeReel(PDF)).toBe('application/pdf')
    expect(typeReel(JPEG)).toBe('image/jpeg')
    expect(typeReel(PNG)).toBe('image/png')
    expect(typeReel(WEBP)).toBe('image/webp')
  })

  it('ne reconnaît ni HTML ni SVG', () => {
    expect(typeReel(HTML)).toBeNull()
    expect(typeReel(SVG)).toBeNull()
  })
})

describe('validation', () => {
  it('accepte un PDF et une image valides', () => {
    expect(validerFichier(PDF)).toMatchObject({ ok: true, mime: 'application/pdf', ext: 'pdf' })
    expect(validerFichier(PNG)).toMatchObject({ ok: true, mime: 'image/png' })
  })

  it('refuse un HTML, même déclaré image/png par le client', () => {
    // Le type annoncé n'entre pas dans la décision : seul le contenu compte.
    const r = validerFichier(HTML)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(415)
  })

  it('refuse un SVG porteur de script', () => {
    expect(validerFichier(SVG)).toMatchObject({ ok: false, status: 415 })
  })

  it('accepte le HEIC — photo iPhone, format inerte', () => {
    // pages/schedule.js envoie le fichier brut, sans conversion : le refuser
    // casserait la saisie de frais depuis un iPhone.
    expect(validerFichier(HEIC)).toMatchObject({ ok: true, mime: 'image/heic' })
  })

  it('ne sert jamais un HEIC en inline', () => {
    const h = {}; const res = { setHeader: (k, v) => { h[k] = v } }
    entetesFichier(res, { mime: 'image/heic', filename: 'photo.heic' })
    expect(h['Content-Disposition']).toMatch(/^attachment/)
  })

  it('mesure la taille sur le contenu décodé', () => {
    expect(validerFichier(PDF, { maxOctets: 4 })).toMatchObject({ ok: false, status: 413 })
    expect(validerFichier(PDF, { maxOctets: 10 * 1024 }).ok).toBe(true)
  })

  it('refuse un fichier vide', () => {
    expect(validerFichier(Buffer.alloc(0))).toMatchObject({ ok: false, status: 400 })
    expect(validerFichier(null)).toMatchObject({ ok: false, status: 400 })
  })
})

describe('nom de fichier', () => {
  it('retire les chemins et force l\'extension du type réel', () => {
    // les séparateurs deviennent « _ », et les points de tête sautent
    expect(nomSur('../../etc/passwd', 'application/pdf')).toBe('_.._etc_passwd.pdf')
    expect(nomSur('photo.svg', 'image/png')).toBe('photo.png')
    expect(nomSur('', 'image/jpeg')).toBe('fichier.jpg')
  })

  it('retire les guillemets et les caractères de contrôle', () => {
    expect(nomSur('a"b\nc.pdf', 'application/pdf')).toBe('abc.pdf')
  })
})

describe('en-têtes de réponse', () => {
  const faux = () => { const h = {}; return { h, setHeader: (k, v) => { h[k] = v } } }

  it('sert les images vérifiées en inline', () => {
    const res = faux(); entetesFichier(res, { mime: 'image/png', filename: 'a.png' })
    expect(res.h['Content-Disposition']).toMatch(/^inline/)
    expect(res.h['X-Content-Type-Options']).toBe('nosniff')
  })

  it('sert les PDF en pièce jointe', () => {
    const res = faux(); entetesFichier(res, { mime: 'application/pdf', filename: 'f.pdf' })
    expect(res.h['Content-Disposition']).toMatch(/^attachment/)
  })

  it('neutralise un type inattendu', () => {
    const res = faux(); entetesFichier(res, { mime: 'text/html', filename: 'x.html' })
    expect(res.h['Content-Type']).toBe('application/octet-stream')
    expect(res.h['Content-Disposition']).toMatch(/^attachment/)
  })

  it('n\'autorise inline que pour des images', () => {
    for (const t of TYPES_AUTORISES) {
      const res = faux(); entetesFichier(res, { mime: t, filename: 'f' })
      const inline = res.h['Content-Disposition'].startsWith('inline')
      expect(inline).toBe(['image/jpeg', 'image/png', 'image/webp'].includes(t))
    }
  })
})
