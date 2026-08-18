import { describe, it, expect } from 'vitest'
import { isAdminUser } from '../lib/requireAdmin'
import { canSeeTask, isAdmin } from '../lib/taskAccess'

// Le rôle fait autorité. Renommer un profil ne doit jamais changer ses droits :
// c'était le cas tant que l'admin était reconnu à son nom.
describe('rôle administrateur', () => {
  it('reconnaît le rôle admin, quel que soit le nom', () => {
    expect(isAdminUser({ name: 'Guillaume', role: 'admin' })).toBe(true)
    expect(isAdminUser({ name: 'Quelquun', role: 'admin' })).toBe(true)
  })

  it('refuse un membre, même nommé Guillaume', () => {
    expect(isAdminUser({ name: 'Guillaume', role: 'member' })).toBe(false)
  })

  it('refuse un utilisateur absent ou sans rôle', () => {
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
    expect(isAdminUser({ name: 'Guillaume' })).toBe(false)
    expect(isAdminUser({ name: 'Guillaume', role: '' })).toBe(false)
  })

  it('ne confond pas un rôle voisin avec admin', () => {
    expect(isAdminUser({ role: 'display' })).toBe(false)
    expect(isAdminUser({ role: 'Admin' })).toBe(false)
  })

  it('propage le rôle aux règles qui en dépendent', () => {
    const prive = { is_private: true, responsible: 'Arnaud' }
    expect(isAdmin({ name: 'Guillaume', role: 'admin' })).toBe(true)
    expect(canSeeTask(prive, { name: 'Guillaume', role: 'admin' })).toBe(true)
    // Un ex-admin rétrogradé perd l'accès sans changer de nom.
    expect(canSeeTask(prive, { name: 'Guillaume', role: 'member' })).toBe(false)
  })
})
