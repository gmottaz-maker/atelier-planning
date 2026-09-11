import { describe, it, expect } from 'vitest'
import { joursOuvresRestants, joursDeRetard, decompte, estJourTravaille } from '../lib/joursOuvres'

// Le vendredi 11 septembre 2026 sert de « aujourd'hui ».
const VEN = '2026-09-11'

describe('jours travaillés', () => {
  it('lundi, mardi, jeudi, vendredi — ni mercredi ni week-end', () => {
    const semaine = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
    const [y, m] = [2026, 8]
    expect(semaine.map(s => estJourTravaille(new Date(y, m, Number(s.slice(8)))))).toEqual(
      [true, true, false, true, true, false, false])
  })
})

describe('joursOuvresRestants', () => {
  it('compte de demain jusqu\'à l\'échéance incluse', () => {
    expect(joursOuvresRestants('2026-09-14', VEN)).toBe(1)  // lundi
    expect(joursOuvresRestants('2026-09-15', VEN)).toBe(2)  // mardi
    expect(joursOuvresRestants('2026-09-17', VEN)).toBe(3)  // jeudi
    expect(joursOuvresRestants('2026-09-18', VEN)).toBe(4)  // vendredi
  })

  it('ne compte pas le mercredi', () => {
    expect(joursOuvresRestants('2026-09-16', VEN)).toBe(2)  // mercredi = même compte que mardi
  })

  it('ne compte pas le week-end', () => {
    expect(joursOuvresRestants('2026-09-12', VEN)).toBe(0)  // samedi
    expect(joursOuvresRestants('2026-09-13', VEN)).toBe(0)  // dimanche
  })

  it('une semaine pleine vaut quatre jours', () => {
    expect(joursOuvresRestants('2026-09-25', VEN)).toBe(8)
  })

  it('vaut 0 le jour même, null une fois l\'échéance passée', () => {
    expect(joursOuvresRestants(VEN, VEN)).toBe(0)
    expect(joursOuvresRestants('2026-09-10', VEN)).toBe(null)
  })

  // Nuit du 24 au 25 octobre 2026 : passage à l'heure d'hiver, journée de
  // 25 heures. Un pas de 86 400 000 ms la compterait deux fois ou jamais.
  it('traverse le changement d\'heure sans compter faux', () => {
    expect(joursOuvresRestants('2026-10-26', '2026-10-23')).toBe(1)  // ven → lun
    expect(joursOuvresRestants('2026-03-30', '2026-03-27')).toBe(1)  // heure d'été
  })

  it('refuse une date malformée ou inexistante', () => {
    expect(joursOuvresRestants(null, VEN)).toBe(null)
    expect(joursOuvresRestants('15.09.2026', VEN)).toBe(null)
    expect(joursOuvresRestants('2026-02-31', VEN)).toBe(null)
  })
})

describe('joursDeRetard — en jours calendaires', () => {
  it('compte le temps écoulé, mercredi et week-end compris', () => {
    expect(joursDeRetard('2026-09-09', VEN)).toBe(2)
    expect(joursDeRetard('2026-09-04', VEN)).toBe(7)
  })
  it('traverse le changement d\'heure', () => {
    expect(joursDeRetard('2026-10-23', '2026-10-26')).toBe(3)
  })
  it('vaut 0 si l\'échéance n\'est pas passée', () => {
    expect(joursDeRetard(VEN, VEN)).toBe(0)
    expect(joursDeRetard('2026-09-14', VEN)).toBe(0)
  })
})

describe('decompte — le libellé affiché', () => {
  it('couvre tous les cas', () => {
    expect(decompte(null, VEN)).toBe('Sans date')
    expect(decompte('', VEN)).toBe('Sans date')
    expect(decompte(VEN, VEN)).toBe("Aujourd'hui !")
    expect(decompte('2026-09-09', VEN)).toBe('Retard 2j')
    expect(decompte('2026-09-18', VEN)).toBe('J-4')
  })

  // Vendredi, livraison samedi : il ne reste AUCUN jour de travail. C'est
  // « J-0 », pas « Aujourd'hui ! » — la livraison n'est pas aujourd'hui.
  it('dit J-0 quand plus aucun jour travaillé ne sépare de la livraison', () => {
    expect(decompte('2026-09-12', VEN)).toBe('J-0')
  })
})
