/**
 * ════════════════════════════════════════════════════════════════════
 *  棒棒糖（Lollipops）—— 类型与常量
 * ════════════════════════════════════════════════════════════════════
 *
 * 规则来源（详见 README）：
 *   - https://www.puzzle-lollipops.com/?size=11
 *   - https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?print=true&chlang=en&id=000OYF
 *
 * 一个棒棒糖 = 1 个圆头 + 相邻 1 格的棍子，共占 1×2 两格。
 * 棍子的朝向必须与「圆头—棍子」连线方向一致：
 *   横向相邻 → 圆头 + 横棍；纵向相邻 → 圆头 + 竖棍。
 *
 * 盘面每格只记录一个符号：
 *   0 = 空（既表示空格，也是模板约定的 Unknown）
 *   1 = 旧版黑圆头（仅兼容旧题库/旧存档，解码后统一成白圆头）
 *   2 = 白圆头
 *   3 = 横棍（─）
 *   4 = 竖棍（│）
 *   5 = 红叉（玩家标记的“确认空地”，不属于题面符号）
 *
 * 现在游戏只使用白圆头；旧数据里的 1 会在 decodeBoard 时归一成 WHITE。
 * 校验/唯一性只看「圆头 / 横棍 / 竖棍 / 空」，红叉不参与配对。
 *
 * 内部推理/求解使用「类型层」编码（CellType）：
 *   -1 = 未知，0 = 空，1 = 圆头，2 = 横棍，3 = 竖棍
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

/* ────────────────────────── 盘面值 ────────────────────────── */

export const EMPTY = 0
/** 旧版黑圆头值：只用于读取旧题库/旧存档，游戏内不再产生 */
export const BLACK = 1
export const WHITE = 2
export const HSTICK = 3
export const VSTICK = 4
/** 红叉：玩家标记的确认空地，不参与棒棒糖配对 */
export const CROSS = 5

/** 所有可放置符号（不含空与红叉） */
export const SYMBOLS: number[] = [WHITE, HSTICK, VSTICK]

/** 类型层常量 */
export const T_EMPTY = 0
export const T_HEAD = 1
export const T_H = 2
export const T_V = 3

/** 方向：0 = 水平，1 = 垂直 */
export const DIR_H = 0
export const DIR_V = 1

/** 盘面值 → 符号类型 */
export function typeOf(value: number): number {
  if (value === BLACK || value === WHITE) return T_HEAD
  if (value === HSTICK) return T_H
  if (value === VSTICK) return T_V
  return T_EMPTY
}

/** 符号类型 → 默认盘面值（用于逻辑解题回填；圆头统一为白） */
export function valueOfType(type: number): number {
  if (type === T_HEAD) return WHITE
  if (type === T_H) return HSTICK
  if (type === T_V) return VSTICK
  return EMPTY
}

/** 题面给定值 → 类型（0 表示没有给定） */
export function givenType(value: number): number {
  if (value === BLACK || value === WHITE) return T_HEAD
  if (value === HSTICK) return T_H
  if (value === VSTICK) return T_V
  return -1
}

/* ────────────────────────── 类型 ────────────────────────── */

/** 棒棒糖题面 */
export interface LollipopPuzzle extends Puzzle {
  /** 每格的给定符号（0 = 无给定，1..4 见盘面值） */
  givens: number[]
  /** 参考解（可选，来自 puzzles-data；完整盘面编码 0..4） */
  solutionText?: string
}

/** 棒棒糖盘面状态 */
export interface LollipopState extends GameState {
  /** 每格的符号（0..4） */
  cells: number[]
  /** 题面给定符号（0..4；0 = 无给定），用于锁定与「预填被改」检测 */
  givens: number[]
  /** 键盘光标（格子索引）；无则 undefined */
  selected?: number
}

/** 视线冲突对：同一行/列中相邻（忽略空格）但类型相同的一对符号 */
export interface SightConflict {
  a: number
  b: number
  /** 0 = 行，1 = 列 */
  dir: number
  /** 两格之间隔着几个空格（0 = 紧挨着，已无可救药） */
  gap: number
}

/** 实时校验结果 */
export interface LollipopResult extends ValidationResult {
  /** 已经放好的符号格数 */
  filled: number
  /** 空格数 */
  empty: number
  /** 已经正确连成的棒棒糖对数 */
  pairs: number
  /** 所有需要高亮的格子 */
  badCells: number[]
  /** 题面预填格被改动 */
  changedGivens: number[]
  /** 没有搭档的符号格 */
  lonelyCells: number[]
  /** 与 2 个及以上符号相邻的格子（不同棒棒糖不能相触） */
  crowdedCells: number[]
  /** 圆头/棍子朝向或类型配错 */
  pairErrors: number[]
  /** 视线阻挡错误涉及的格子 */
  sightErrors: number[]
  /** 视线冲突对（渲染虚线用） */
  sightConflicts: SightConflict[]
}

/** puzzles-data.ts 的原始题面条目 */
export interface RawLollipopPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 题面编码串，见 encodeBoard */
  board: string
  /** 参考解编码串（完整盘面，0..4） */
  solution?: string
}

export function asLollipopPuzzle(p: Puzzle): LollipopPuzzle {
  return p as LollipopPuzzle
}

export function asLollipopState(s: GameState): LollipopState {
  return s as LollipopState
}

/* ────────────────────────── 几何 ────────────────────────── */

/** 预计算的邻接关系（上下左右） */
export interface Geo {
  w: number
  h: number
  n: number
  /** neighbors[i] = [{ j, dir }]，dir: 0 = 水平，1 = 垂直 */
  neighbors: Array<Array<{ j: number; dir: number }>>
}

export function makeGeo(w: number, h: number): Geo {
  const n = w * h
  const neighbors: Geo['neighbors'] = new Array(n)
  for (let i = 0; i < n; i++) {
    const x = i % w
    const y = (i / w) | 0
    const list: Array<{ j: number; dir: number }> = []
    if (x > 0) list.push({ j: i - 1, dir: DIR_H })
    if (x + 1 < w) list.push({ j: i + 1, dir: DIR_H })
    if (y > 0) list.push({ j: i - w, dir: DIR_V })
    if (y + 1 < h) list.push({ j: i + w, dir: DIR_V })
    neighbors[i] = list
  }
  return { w, h, n, neighbors }
}

/** 该方向上的「搭档」应具有的符号类型；不可能时返回 -1 */
export function partnerTypeOf(type: number, dir: number): number {
  if (type === T_HEAD) return dir === DIR_H ? T_H : T_V
  if (type === T_H) return dir === DIR_H ? T_HEAD : -1
  if (type === T_V) return dir === DIR_V ? T_HEAD : -1
  return -1
}

/** 两个相邻符号能否组成一个合法棒棒糖 */
export function canPair(typeA: number, typeB: number, dir: number): boolean {
  return partnerTypeOf(typeA, dir) === typeB
}

/* ────────────────────────── 编码 ────────────────────────── */

/** 把盘面值数组编码成 0..4 的数字串 */
export function encodeBoard(cells: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < cells.length; i++) {
    const raw = cells[i]! | 0
    const v = raw === BLACK ? WHITE : raw
    out += v >= 0 && v <= CROSS ? String(v) : '0'
  }
  return out
}

export function decodeBoard(text: unknown, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(EMPTY)
  for (let i = 0; i < expected; i++) {
    const c = text.charCodeAt(i) - 48
    if (c < 0 || c > CROSS) return null
    out[i] = c === BLACK ? WHITE : c
  }
  return out
}

/** 把盘面值数组转换成类型层数组（给定的 0 视为未知） */
export function typesFromValues(values: ArrayLike<number>): Int8Array {
  const out = new Int8Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = typeOf(values[i]!)
  return out
}

/** 从题面 givens 得到类型层初始约束（-1 = 未知） */
export function typesFromGivens(givens: ArrayLike<number>): Int8Array {
  const out = new Int8Array(givens.length)
  for (let i = 0; i < givens.length; i++) {
    const v = givens[i]!
    out[i] = v === EMPTY ? -1 : typeOf(v)
  }
  return out
}

/**
 * 把类型层解还原成盘面值：圆头统一为白圆头。
 */
export function valuesFromTypes(types: ArrayLike<number>, givens?: ArrayLike<number>): number[] {
  void givens
  const out = new Array<number>(types.length).fill(EMPTY)
  for (let i = 0; i < types.length; i++) {
    const t = types[i]!
    if (t === T_HEAD) out[i] = WHITE
    else if (t === T_H) out[i] = HSTICK
    else if (t === T_V) out[i] = VSTICK
    else out[i] = EMPTY
  }
  return out
}

/* ────────────────────────── 纯规则 ────────────────────────── */

/**
 * 只做类型层校验（不含题面给定）：
 *   - 每个符号格恰好有 1 个上下左右相邻的符号格；
 *   - 这对相邻格必须是「圆头 + 朝向正确的棍子」；
 *   - 同一行/列中相邻的两个符号（忽略空格）类型不能相同。
 *
 * 返回错误明细；ok = 完全合法。
 */
export interface TypeCheckResult {
  ok: boolean
  lonely: number[]
  crowded: number[]
  pairErrors: number[]
  sightErrors: number[]
  sightConflicts: SightConflict[]
  pairs: number
}

export function checkTypeGrid(geo: Geo, types: ArrayLike<number>): TypeCheckResult {
  const { w, h, n, neighbors } = geo
  const lonely: number[] = []
  const crowded: number[] = []
  const pairErrors: number[] = []

  for (let i = 0; i < n; i++) {
    const t = types[i]!
    if (t === T_EMPTY) continue
    const nb: number[] = []
    const nbs = neighbors[i]!
    for (let k = 0; k < nbs.length; k++) {
      const j = nbs[k]!.j
      if (types[j] !== T_EMPTY) nb.push(j)
    }
    if (nb.length === 1) {
      const j = nb[0]!
      const d = directionBetween(geo, i, j)
      if (!canPair(t, types[j]!, d)) {
        pairErrors.push(i, j)
      }
    } else if (nb.length === 0) {
      lonely.push(i)
    } else {
      crowded.push(i)
    }
  }

  const sightErrors: number[] = []
  const sightConflicts: SightConflict[] = []
  const scanLine = (cells: number[], dir: number): void => {
    let prev = -1
    let prevPos = -1
    for (let pos = 0; pos < cells.length; pos++) {
      const i = cells[pos]!
      if (types[i] === T_EMPTY) continue
      if (prev >= 0 && types[prev] === types[i]) {
        sightErrors.push(prev, i)
        sightConflicts.push({ a: prev, b: i, dir, gap: pos - prevPos - 1 })
      }
      prev = i
      prevPos = pos
    }
  }
  for (let y = 0; y < h; y++) {
    const row: number[] = []
    for (let x = 0; x < w; x++) row.push(y * w + x)
    scanLine(row, 0)
  }
  for (let x = 0; x < w; x++) {
    const col: number[] = []
    for (let y = 0; y < h; y++) col.push(y * w + x)
    scanLine(col, 1)
  }

  // 统计已经两两配对的棒棒糖数（每个格子只归入一对）
  const seen = new Set<number>()
  let pairs = 0
  for (let i = 0; i < n; i++) {
    if (types[i] === T_EMPTY || seen.has(i)) continue
    for (const { j, dir } of neighbors[i]!) {
      if (types[j] === T_EMPTY || seen.has(j)) continue
      if (canPair(types[i]!, types[j]!, dir)) {
        seen.add(i)
        seen.add(j)
        pairs++
        break
      }
    }
  }

  return {
    ok:
      lonely.length === 0 &&
      crowded.length === 0 &&
      pairErrors.length === 0 &&
      sightErrors.length === 0,
    lonely: uniq(lonely),
    crowded: uniq(crowded),
    pairErrors: uniq(pairErrors),
    sightErrors: uniq(sightErrors),
    sightConflicts,
    pairs,
  }
}

export function directionBetween(geo: Geo, a: number, b: number): number {
  return a % geo.w === b % geo.w ? DIR_V : DIR_H
}

function uniq(list: number[]): number[] {
  return Array.from(new Set(list)).sort((x, y) => x - y)
}

