/**
 * 棒棒糖 —— 题库生成器（确定性随机，npm run gen 用）
 *
 * 流程：
 *   1. 随机贪心铺一组合法棒棒糖（圆头 + 朝向正确的棍子，互不相触，视线阻挡成立）；
 *   2. 给圆头随机分配黑 / 白颜色，得到完整参考解；
 *   3. 从「所有符号都给定」出发，随机尝试删掉线索，
 *      只要题面仍然只有唯一解（类型层）就保留删除；
 *   4. 输出题面（givens）与参考解（完整盘面）。
 *
 * 唯一解在类型层判定：黑白圆头规则等价（见 README），
 * 因此求解器只关心「圆头 / 横棍 / 竖棍 / 空」。
 */

import type { Difficulty } from '../core/types'
import { countTypeSolutions } from './solver.ts'
import {
  BLACK,
  EMPTY,
  HSTICK,
  T_EMPTY,
  T_HEAD,
  T_H,
  T_V,
  VSTICK,
  WHITE,
  encodeBoard,
  makeGeo,
  typesFromGivens,
  type Geo,
} from './types.ts'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** 最近的非空格子在各方向上是否同类（视线规则静态检查） */
function sightOk(geo: Geo, types: Int8Array, cell: number): boolean {
  const { w, h } = geo
  const x = cell % w
  const y = (cell / w) | 0
  const t = types[cell]!
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  for (const [dx, dy] of dirs) {
    let cx = x + dx
    let cy = y + dy
    while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
      const j = cy * w + cx
      if (types[j] !== T_EMPTY) {
        if (types[j] === t) return false
        break
      }
      cx += dx
      cy += dy
    }
  }
  return true
}

function canPlace(
  geo: Geo,
  types: Int8Array,
  head: number,
  stick: number,
  dir: number,
): boolean {
  if (types[head] !== T_EMPTY || types[stick] !== T_EMPTY) return false
  const expected = dir === 0 ? T_H : T_V
  // 先临时放入再检查其它相邻格与视线
  for (const { j } of geo.neighbors[head]!) {
    if (j !== stick && types[j] !== T_EMPTY) return false
  }
  for (const { j } of geo.neighbors[stick]!) {
    if (j !== head && types[j] !== T_EMPTY) return false
  }
  types[head] = T_HEAD
  types[stick] = expected
  const ok = sightOk(geo, types, head) && sightOk(geo, types, stick)
  types[head] = T_EMPTY
  types[stick] = T_EMPTY
  return ok
}

interface Candidate {
  head: number
  stick: number
  dir: number
}

function collectCandidates(geo: Geo, types: Int8Array): Candidate[] {
  const out: Candidate[] = []
  for (let i = 0; i < geo.n; i++) {
    if (types[i] !== T_EMPTY) continue
    const x = i % geo.w
    const y = (i / geo.w) | 0
    // 只朝右 / 下扩展，保证每对只扫描一次
    if (x + 1 < geo.w) {
      const j = i + 1
      if (canPlace(geo, types, i, j, 0)) out.push({ head: i, stick: j, dir: 0 })
      if (canPlace(geo, types, j, i, 0)) out.push({ head: j, stick: i, dir: 0 })
    }
    if (y + 1 < geo.h) {
      const j = i + geo.w
      if (canPlace(geo, types, i, j, 1)) out.push({ head: i, stick: j, dir: 1 })
      if (canPlace(geo, types, j, i, 1)) out.push({ head: j, stick: i, dir: 1 })
    }
  }
  return out
}

function greedySolution(geo: Geo, rng: () => number): Int8Array {
  const types = new Int8Array(geo.n).fill(T_EMPTY)
  for (let step = 0; step < geo.n; step++) {
    const candidates = collectCandidates(geo, types)
    if (!candidates.length) break
    const pick = candidates[Math.floor(rng() * candidates.length)]!
    types[pick.head] = T_HEAD
    types[pick.stick] = pick.dir === 0 ? T_H : T_V
  }
  return types
}

function countPairs(geo: Geo, types: Int8Array): number {
  let pairs = 0
  for (let i = 0; i < geo.n; i++) if (types[i] === T_HEAD) pairs++
  return pairs
}

/** 贪心重启若干次，取棒棒糖最多的一份 */
function buildSolution(w: number, h: number, rng: () => number, attempts: number): Int8Array {
  const geo = makeGeo(w, h)
  let best = greedySolution(geo, rng)
  let bestPairs = countPairs(geo, best)
  for (let a = 1; a < attempts; a++) {
    const cand = greedySolution(geo, rng)
    const pairs = countPairs(geo, cand)
    if (pairs > bestPairs) {
      best = cand
      bestPairs = pairs
    }
  }
  return best
}

function colorize(types: Int8Array, rng: () => number): number[] {
  const values = new Array<number>(types.length).fill(EMPTY)
  for (let i = 0; i < types.length; i++) {
    const t = types[i]!
    if (t === T_HEAD) values[i] = rng() < 0.5 ? BLACK : WHITE
    else if (t === T_H) values[i] = HSTICK
    else if (t === T_V) values[i] = VSTICK
  }
  return values
}

/** 删减线索：保留唯一解 */
function reduceGivens(
  w: number,
  h: number,
  values: number[],
  rng: () => number,
  passes: number,
  minClues: number,
): number[] {
  const given = values.slice()
  const cells: number[] = []
  for (let i = 0; i < given.length; i++) if (given[i] !== EMPTY) cells.push(i)
  let clues = cells.length
  for (let pass = 0; pass < passes; pass++) {
    let removed = false
    for (const i of shuffle(cells, rng)) {
      if (clues <= minClues) break
      if (given[i] === EMPTY) continue
      const saved = given[i]!
      given[i] = EMPTY
      const initial = typesFromGivens(given)
      const out = countTypeSolutions(w, h, initial, 2, 250_000)
      if (!out.timedOut && out.solutions.length === 1) {
        removed = true
        clues--
      } else {
        given[i] = saved
      }
    }
    if (!removed) break
  }
  return given
}

export interface GeneratedPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

interface Spec {
  seed: number
  w: number
  h: number
  difficulty: Difficulty
  name: string
  series: string
  /** 贪心重启次数 */
  attempts: number
  /** 线索删减轮数 */
  passes: number
  /** 至少保留多少条线索（越多越简单） */
  minClues: number
}

const SPECS: Spec[] = [
  { seed: 0x10c0ffee, w: 5, h: 5, difficulty: 'easy', name: '初识棒棒糖', series: '入门', attempts: 24, passes: 2, minClues: 6 },
  { seed: 0x20c0ffee, w: 6, h: 5, difficulty: 'easy', name: '圆头与棍子', series: '入门', attempts: 24, passes: 2, minClues: 7 },
  { seed: 0x30c0ffee, w: 6, h: 6, difficulty: 'easy', name: '糖果小铺', series: '入门', attempts: 28, passes: 2, minClues: 8 },
  { seed: 0x40c0ffee, w: 7, h: 6, difficulty: 'medium', name: '甜蜜视线', series: '进阶', attempts: 32, passes: 2, minClues: 9 },
  { seed: 0x50c0ffee, w: 7, h: 7, difficulty: 'medium', name: '错落糖果', series: '进阶', attempts: 36, passes: 2, minClues: 10 },
  { seed: 0x60c0ffee, w: 8, h: 6, difficulty: 'medium', name: '隔空对望', series: '进阶', attempts: 36, passes: 2, minClues: 10 },
  { seed: 0x70c0ffee, w: 8, h: 8, difficulty: 'hard', name: '棒棒糖森林', series: '挑战', attempts: 44, passes: 2, minClues: 12 },
  { seed: 0x80c0ffee, w: 9, h: 7, difficulty: 'hard', name: '终局糖果', series: '挑战', attempts: 48, passes: 2, minClues: 12 },
]

function buildPuzzle(spec: Spec): GeneratedPuzzle {
  const rng = mulberry32(spec.seed)
  const geo = makeGeo(spec.w, spec.h)
  const types = buildSolution(spec.w, spec.h, rng, spec.attempts)
  const pairs = countPairs(geo, types)
  if (pairs < 4) throw new Error(`[gen] ${spec.name} 只放下 ${pairs} 个棒棒糖`)
  const values = colorize(types, rng)
  const givens = reduceGivens(spec.w, spec.h, values, rng, spec.passes, spec.minClues)
  return {
    id: `lollipops-${spec.w}x${spec.h}-${spec.seed.toString(36)}`,
    name: spec.name,
    width: spec.w,
    height: spec.h,
    difficulty: spec.difficulty,
    series: spec.series,
    board: encodeBoard(givens),
    solution: encodeBoard(values),
  }
}

export function generatePuzzles(): GeneratedPuzzle[] {
  const out: GeneratedPuzzle[] = []
  for (const spec of SPECS) {
    const t0 = Date.now()
    const puzzle = buildPuzzle(spec)
    const clues = puzzle.board.split('').filter((c) => c !== '0').length
    console.log(
      `[lollipops gen] ${puzzle.name} ${spec.w}×${spec.h} · 线索 ${clues} · ${Date.now() - t0}ms`,
    )
    out.push(puzzle)
  }
  return out
}


