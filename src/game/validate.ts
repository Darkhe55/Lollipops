/**
 * 棒棒糖 —— 实时校验
 *
 * 判定「完成」的条件（题面唯一解时等价于解出）：
 *   1. 题面给定的符号没有被改动；
 *   2. 每个符号格恰好与 1 个符号格上下左右相邻；
 *   3. 每对相邻格必须是「圆头 + 朝向正确的棍子」；
 *   4. 同一行/列中相邻的两个符号（忽略空格）类型不同。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import {
  checkTypeGrid,
  makeGeo,
  T_EMPTY,
  typeOf,
  asLollipopPuzzle,
  asLollipopState,
  type LollipopResult,
} from './types.ts'

export function validate(state: GameState, puzzle: Puzzle): LollipopResult {
  const s = asLollipopState(state)
  const p = asLollipopPuzzle(puzzle)
  const w = s.width
  const h = s.height
  const size = w * h
  const cells = s.cells
  const givens = s.givens && s.givens.length === size ? s.givens : (p.givens ?? [])
  const geo = makeGeo(w, h)

  const types = new Int8Array(size)
  const changedGivens: number[] = []
  let filled = 0
  for (let i = 0; i < size; i++) {
    const v = cells[i] ?? 0
    types[i] = typeOf(v)
    if (types[i] !== T_EMPTY) filled++
    const g = givens[i] ?? 0
    if (g !== 0 && v !== g) changedGivens.push(i)
  }

  const check = checkTypeGrid(geo, types)
  const tightSight = (check.sightConflicts ?? []).filter((c) => c.gap === 0)

  const bad = new Set<number>()
  for (const i of changedGivens) bad.add(i)
  for (const i of check.crowded) bad.add(i)
  for (const i of check.pairErrors) bad.add(i)
  for (const c of tightSight) {
    bad.add(c.a)
    bad.add(c.b)
  }

  const solved = changedGivens.length === 0 && check.ok

  return {
    solved,
    filled,
    empty: size - filled,
    pairs: check.pairs,
    badCells: Array.from(bad).sort((a, b) => a - b),
    changedGivens,
    lonelyCells: check.lonely,
    crowdedCells: check.crowded,
    pairErrors: check.pairErrors,
    sightErrors: check.sightErrors,
    sightConflicts: check.sightConflicts,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as LollipopResult
  if (r.solved) {
    return [`完成！共 ${r.pairs} 个棒棒糖`, '所有圆头与棍子都正确配对']
  }
  const bits: string[] = []
  if (r.changedGivens && r.changedGivens.length > 0) bits.push('题面预填符号被改动')
  if (r.crowdedCells && r.crowdedCells.length > 0) {
    bits.push(`${r.crowdedCells.length} 格与多个符号相邻（不同棒棒糖不能相触）`)
  }
  if (r.pairErrors && r.pairErrors.length > 0) {
    bits.push(`${Math.ceil(r.pairErrors.length / 2)} 处圆头与棍子朝向不匹配`)
  }
  const conflicts = r.sightConflicts ?? []
  if (conflicts.length > 0) {
    const tight = conflicts.filter((c) => c.gap === 0).length
    bits.push(
      tight > 0
        ? `${tight} 处同类符号紧挨着（必须隔开）`
        : `${conflicts.length} 处同类符号之间还缺不同符号阻挡`,
    )
  }
  if (r.lonelyCells && r.lonelyCells.length > 0) {
    bits.push(`还有 ${r.lonelyCells.length} 个符号没有搭档`)
  }
  if (bits.length === 0) {
    if (typeof r.pairs === 'number' && r.pairs > 0) bits.push(`已连成 ${r.pairs} 个棒棒糖`)
    else bits.push('继续放置棒棒糖（圆头 + 一格棍子）')
  }
  return bits
}
