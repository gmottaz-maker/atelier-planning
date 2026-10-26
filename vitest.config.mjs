import { defineConfig, configDefaults } from 'vitest/config'

// Les worktrees de `.claude/` sont des COPIES COMPLÈTES du dépôt : un worktree
// par chantier, chacun avec son `tests/`. Sans cette exclusion, `npm test`
// lancé à la racine ramasse aussi les leurs — 3012 tests au lieu de 1616 le
// 26 octobre 2026, avec deux worktrees ouverts.
//
// Le vrai danger n'est pas le compte, c'est le verdict : un test cassé sur la
// branche d'un autre chantier faisait échouer la suite de `main`, qui est
// pourtant saine. On ne débogue pas longtemps avant de comprendre.
//
// La CI n'est pas concernée — elle part d'un clone neuf, sans worktree.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
