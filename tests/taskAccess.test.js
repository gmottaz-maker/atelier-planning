import { describe, it, expect } from 'vitest'
import { canSeeTask, visibleTasks, resolvePrivateOwner } from '../lib/taskAccess'

const admin = { name: 'Guillaume' }
const gabin = { name: 'Gabin' }
const arnaud = { name: 'Arnaud' }

describe('accès aux tâches', () => {
  it('laisse passer les tâches non privées', () => {
    expect(canSeeTask({ is_private: false, responsible: 'Arnaud' }, gabin)).toBe(true)
    expect(canSeeTask({ responsible: 'Arnaud' }, gabin)).toBe(true)
  })

  it('réserve une tâche privée à son responsable', () => {
    const t = { is_private: true, responsible: 'Arnaud' }
    expect(canSeeTask(t, arnaud)).toBe(true)
    expect(canSeeTask(t, gabin)).toBe(false)
  })

  it('laisse l\'admin voir les tâches privées', () => {
    expect(canSeeTask({ is_private: true, responsible: 'Arnaud' }, admin)).toBe(true)
  })

  it('ne laisse rien voir à un utilisateur absent', () => {
    expect(canSeeTask({ is_private: true, responsible: 'Arnaud' }, null)).toBe(false)
    expect(canSeeTask({ is_private: true, responsible: 'Arnaud' }, undefined)).toBe(false)
  })

  it('retire les tâches privées des autres d\'une liste', () => {
    const tasks = [
      { id: 1, is_private: false, responsible: 'Arnaud' },
      { id: 2, is_private: true, responsible: 'Arnaud' },
      { id: 3, is_private: true, responsible: 'Gabin' },
    ]
    expect(visibleTasks(tasks, gabin).map(t => t.id)).toEqual([1, 3])
    expect(visibleTasks(tasks, arnaud).map(t => t.id)).toEqual([1, 2])
    expect(visibleTasks(tasks, admin).map(t => t.id)).toEqual([1, 2, 3])
    expect(visibleTasks(null, gabin)).toEqual([])
  })

  it('empêche un membre de créer une tâche privée au nom d\'un collègue', () => {
    expect(resolvePrivateOwner('Arnaud', gabin)).toBe('Gabin')
    expect(resolvePrivateOwner('Gabin', gabin)).toBe('Gabin')
    expect(resolvePrivateOwner('Arnaud', admin)).toBe('Arnaud')
  })
})
