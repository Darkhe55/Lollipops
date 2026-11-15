/**
 * 棒棒糖 —— 回溯求解器（类型层）
 *
 * 在类型层（未知 / 空 / 圆头 / 横棍 / 竖棍）上做「配对 + 留空」搜索：
 * 每次挑候选最少的未知格，分支：
 *   - 留空；
 *   - 与某个相邻的未知格组成棒棒糖（两种朝向角色：谁当圆头）。
 * 每个分支先跑规则传播，再继续搜索。
 *
 * 该求解器用于：
 *   - 「显示解 / 提示」；
 *   - 自定义题板求解；
 *   - 题库唯一解审计（countSolutions）；
 *   - 逻辑解题中的反证探测。
 */

import type { Puzzle, SolveResult } from '../core/types'
import {
  allPaired,
  assign,
  cloneEngine,
  isComplete,
  makeEngine,
  propagate,
  typesOf,
  type EngineState,
} from './engine.ts'
import {
  T_EMPTY,
  T_HEAD,
  checkTypeGrid,
  givenType,
  makeGeo,
  partnerTypeOf,
  typesFromGivens,
  valuesFromTypes,
  type Geo,
  type LollipopPuzzle,
} from './types.ts'

export interface SearchOutcome {
  solutions: number[][]
  nodes: number
  timedOut: boolean
}

/** 把一个已知类型的格子与相邻的未知格配成棒棒糖并继续搜索 */
function tryPair(est: EngineState, i: number, j: number, dir: number, iIsHead: boolean): EngineState | null {
  const next = cloneEngine(est, false)
  const type = iIsHead ? T_HEAD : partnerTypeOf(T_HEAD, dir)
  if (type < 0) return null
  if (!assign(next, i, type, 0)) return null
  if (next.partner[j]! >= 0) return null
  if (!assign(next, j, partnerTypeOf(type, dir), 0)) return null
  next.partner[i] = j
  next.partner[j] = i
  for (const { j: k } of next.geo.neighbors[i]!) {
    if (k === j) continue
    if (next.val[k]! === -1) next.val[k] = T_EMPTY
    else if (next.val[k]! > 0) return null
  }
  for (const { j: k } of next.geo.neighbors[j]!) {
    if (k === i) continue
    if (next.val[k]! === -1) next.val[k] = T_EMPTY
    else if (next.val[k]! > 0) return null
  }
  return next
}

function optionCount(est: EngineState, i: number): number {
  const { geo, val, partner } = est
  let count = 1 // 留空
  for (const { j, dir } of geo.neighbors[i]!) {
    const vj = val[j]!
    if (vj === -1) count += 2
    else if (vj > 0 && partner[j]! < 0 && partnerTypeOf(vj, dir) > 0) count += 1
  }
  return count
}

function pickCell(est: EngineState): number {
  const { geo, val } = est
  let best = -1
  let bestCount = Infinity
  let bestAssigned = -1
  for (let i = 0; i < geo.n; i++) {
    if (val[i]! !== -1) continue
    const c = optionCount(est, i)
    if (c < bestCount) {
      bestCount = c
      best = i
      bestAssigned = 0
      for (const { j } of geo.neighbors[i]!) if (val[j]! > 0) bestAssigned++
      if (c === 1) break
    } else if (c === bestCount && bestAssigned <= 0) {
      let assigned = 0
      for (const { j } of geo.neighbors[i]!) if (val[j]! > 0) assigned++
      if (assigned > 0) {
        best = i
        bestAssigned = assigned
      }
    }
  }
  return best
}

function search(
  geo: Geo,
  initial: ArrayLike<number>,
  limit: number,
  maxNodes: number,
): SearchOutcome {
  const solutions: number[][] = []
  let nodes = 0
  let timedOut = false
  let stop = false

  const dfs = (est: EngineState): void => {
    if (stop) return
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      stop = true
      return
    }
    if (!propagate(est)) return
    if (isComplete(est)) {
      if (!allPaired(est)) return
      const types = typesOf(est)
      if (!checkTypeGrid(geo, types).ok) return
      solutions.push(types)
      if (solutions.length >= limit) stop = true
      return
    }
    const i = pickCell(est)
    if (i < 0) return

    // ① 留空
    {
      const next = cloneEngine(est, false)
      if (assign(next, i, T_EMPTY, 0)) dfs(next)
    }
    if (stop) return

    // ② 与相邻格配对
    for (const { j, dir } of geo.neighbors[i]!) {
      const vj = est.val[j]!
      if (vj === -1) {
        const a = tryPair(est, i, j, dir, true)
        if (a) dfs(a)
        if (stop) return
        const b = tryPair(est, i, j, dir, false)
        if (b) dfs(b)
      } else if (vj > 0 && est.partner[j]! < 0) {
        const a = tryPair(est, i, j, dir, true)
        if (a) dfs(a)
        if (stop) return
        const b = tryPair(est, i, j, dir, false)
        if (b) dfs(b)
      }
      if (stop) return
    }
  }

  const est = makeEngine(geo, initial, false)
  dfs(est)
  return { solutions, nodes, timedOut }
}

/** 统计类型层解的个数（最多 limit 个） */
export function countTypeSolutions(
  w: number,
  h: number,
  initial: ArrayLike<number>,
  limit = 2,
  maxNodes = 400_000,
): SearchOutcome {
  return search(makeGeo(w, h), initial, limit, maxNodes)
}

/** 求一个类型层解 */
export function findTypeSolution(
  w: number,
  h: number,
  initial: ArrayLike<number>,
  maxNodes = 400_000,
): number[] | null {
  const out = search(makeGeo(w, h), initial, 1, maxNodes)
  return out.solutions[0] ?? null
}

/** 判断在给定约束下是否还有解（反证探测用） */
export function hasSolution(
  w: number,
  h: number,
  initial: ArrayLike<number>,
  maxNodes = 300_000,
): boolean {
  const out = search(makeGeo(w, h), initial, 1, maxNodes)
  return out.solutions.length > 0
}

function makeColoredState(p: LollipopPuzzle, types: number[]) {
  const cells = valuesFromTypes(types, p.givens)
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells,
    givens: p.givens.slice(),
  }
}

/** 适配器入口：回溯求解内置/自定义题 */
export function solvePuzzle(puzzle: Puzzle, maxNodes = 400_000): SolveResult {
  const p = puzzle as LollipopPuzzle
  const size = p.width * p.height
  if (!Array.isArray(p.givens) || p.givens.length !== size) {
    return { solved: false, solution: null, nodes: 0, timedOut: false }
  }
  const initial = typesFromGivens(p.givens)
  const out = search(makeGeo(p.width, p.height), initial, 1, maxNodes)
  const types = out.solutions[0]
  if (!types) {
    return { solved: false, solution: null, nodes: out.nodes, timedOut: out.timedOut }
  }
  return {
    solved: true,
    solution: makeColoredState(p, types),
    nodes: out.nodes,
    timedOut: false,
  }
}

/** 题面给定是否自洽（给定格之间没有直接矛盾） */
export function givensConsistent(p: LollipopPuzzle): boolean {
  const geo = makeGeo(p.width, p.height)
  const initial = new Int8Array(geo.n)
  for (let i = 0; i < geo.n; i++) {
    const g = p.givens[i] ?? 0
    initial[i] = g === 0 ? -1 : givenType(g)
  }
  const est = makeEngine(geo, initial, false)
  return propagate(est)
}
