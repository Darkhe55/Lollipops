/**
 * 棒棒糖 —— 棋盘状态与键盘光标
 */

import type { GameState, HitTarget, KeyboardSupport, Move, Puzzle } from '../core/types'
import {
  BLACK,
  CROSS,
  EMPTY,
  HSTICK,
  VSTICK,
  WHITE,
  asLollipopPuzzle,
  asLollipopState,
  decodeBoard,
  encodeBoard,
  typeOf,
  type LollipopState,
} from './types.ts'

const CYCLE = [EMPTY, WHITE, HSTICK, VSTICK]

function isSymbol(v: number): boolean {
  return v === WHITE || v === HSTICK || v === VSTICK
}

export function createEmptyState(puzzle: Puzzle): LollipopState {
  const p = asLollipopPuzzle(puzzle)
  const size = p.width * p.height
  const givens = new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    const v = p.givens?.[i] ?? EMPTY
    givens[i] = v === BLACK ? WHITE : isSymbol(v) ? v : EMPTY
  }
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells: givens.slice(),
    givens,
    selected: size > 0 ? 0 : undefined,
  }
}

export function cloneState(state: GameState): LollipopState {
  const s = asLollipopState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: s.cells.slice(),
    givens: s.givens.slice(),
    selected: s.selected,
  }
}

/** 左键循环：空 → 白圆头 → 横棍 → 竖棍 → 空 */
export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asLollipopState(state)
  const given = s.givens[target.index] ?? EMPTY
  if (isSymbol(given)) return given
  const cur = s.cells[target.index] ?? EMPTY
  // 负面标记（红叉）→ 正面1；正面循环：空 → 正面1 → 正面2 → …
  if (cur === CROSS) return WHITE
  const pos = CYCLE.indexOf(cur)
  return CYCLE[(pos + 1) % CYCLE.length] ?? EMPTY
}

/** 右键：空格/正面 → 红叉；红叉 → 空（题面给定格不动） */
export function rightClickValue(state: GameState, target: HitTarget): number {
  const s = asLollipopState(state)
  const given = s.givens[target.index] ?? EMPTY
  if (isSymbol(given)) return given
  const cur = s.cells[target.index] ?? EMPTY
  if (cur === CROSS) return EMPTY
  return CROSS
}

export function applyMove(state: GameState, move: Move): void {
  const s = asLollipopState(state)
  if (move.index < 0 || move.index >= s.cells.length) return
  const given = s.givens[move.index] ?? EMPTY
  if (isSymbol(given)) {
    s.cells[move.index] = given
    return
  }
  const v = Math.floor(move.to)
  s.cells[move.index] = v === CROSS ? CROSS : v >= EMPTY && v <= VSTICK ? (v === BLACK ? WHITE : v) : EMPTY
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asLollipopState(state).cells[index] ?? EMPTY
}

/** 存档的预填格 / 尺寸必须与当前题面一致，否则视为旧题面的过期进度 */
export function stateMatchesPuzzle(state: GameState, puzzle: Puzzle): boolean {
  const s = asLollipopState(state)
  const p = asLollipopPuzzle(puzzle)
  const size = p.width * p.height
  if (s.width !== p.width || s.height !== p.height) return false
  if (!Array.isArray(s.cells) || s.cells.length !== size) return false
  if (!Array.isArray(s.givens) || s.givens.length !== size) return false
  for (let i = 0; i < size; i++) {
    if ((s.givens[i] ?? EMPTY) !== (p.givens?.[i] ?? EMPTY)) return false
  }
  return true
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asLollipopState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: encodeBoard(s.cells),
    givens: encodeBoard(s.givens),
    selected: typeof s.selected === 'number' ? s.selected : -1,
  }
}

export function deserializeState(data: Record<string, unknown>): LollipopState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  const w = data.width
  const h = data.height
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  const size = w * h
  const cells = decodeBoard(data.cells, size)
  if (!cells) return null
  const givens = decodeBoard(data.givens, size) ?? new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    if (isSymbol(givens[i]!)) cells[i] = givens[i]!
  }
  const selected =
    typeof data.selected === 'number' && data.selected >= 0 && data.selected < size
      ? data.selected
      : size > 0
        ? 0
        : undefined
  return { puzzleId: data.puzzleId, width: w, height: h, cells, givens, selected }
}

/** 提示一格：优先补空格，其次纠正类型；仅颜色不同的圆头不算错 */
export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asLollipopState(state)
  const sol = asLollipopState(solution)
  const size = Math.min(s.cells.length, sol.cells.length)
  for (let i = 0; i < size; i++) {
    if (isSymbol(s.givens[i] ?? EMPTY)) continue
    const cur = s.cells[i] ?? EMPTY
    const want = sol.cells[i] ?? EMPTY
    if (typeOf(cur) === EMPTY && typeOf(want) !== EMPTY) {
      return { index: i, from: cur, to: want }
    }
  }
  for (let i = 0; i < size; i++) {
    if (isSymbol(s.givens[i] ?? EMPTY)) continue
    const cur = s.cells[i] ?? EMPTY
    const want = sol.cells[i] ?? EMPTY
    if (typeOf(cur) !== typeOf(want)) {
      return { index: i, from: cur, to: want }
    }
  }
  return null
}

/* ────────────────────────── 键盘光标 ────────────────────────── */

export function cursorOf(state: GameState): number | null {
  const s = asLollipopState(state)
  const index = s.selected
  if (typeof index !== 'number' || index < 0 || index >= s.cells.length) return null
  return index
}

export function setCursor(state: GameState, index: number | null): void {
  const s = asLollipopState(state)
  s.selected = index ?? undefined
}

export function moveCursor(
  state: GameState,
  puzzle: Puzzle,
  index: number | null,
  dx: number,
  dy: number,
): number | null {
  const p = asLollipopPuzzle(puzzle)
  const s = asLollipopState(state)
  if (p.width <= 0 || p.height <= 0) return null
  let cur = index
  if (cur === null || cur < 0 || cur >= p.width * p.height) {
    cur = 0
    s.selected = 0
    return 0
  }
  const x = Math.max(0, Math.min(p.width - 1, (cur % p.width) + dx))
  const y = Math.max(0, Math.min(p.height - 1, Math.floor(cur / p.width) + dy))
  const next = y * p.width + x
  s.selected = next
  return next
}

/**
 * 键盘直接落子：
 *   空格 = 循环切换；1 / 2 / 3 = 白圆头 / 横棍 / 竖棍；
 *   Backspace / Delete = 清除。
 * 返回 null 表示不处理（交给全局快捷键）。
 */
export function keyboardInput(
  state: GameState,
  _puzzle: Puzzle,
  index: number,
  key: string,
): Move | null {
  const s = asLollipopState(state)
  if (index < 0 || index >= s.cells.length) return null
  const given = s.givens[index] ?? EMPTY
  if (isSymbol(given)) return null
  const from = s.cells[index] ?? EMPTY
  let to = from
  if (key === ' ') to = cycleValue(state, { index })
  else if (key === '1') to = WHITE
  else if (key === '2') to = HSTICK
  else if (key === '3') to = VSTICK
  else if (key === 'Backspace' || key === 'Delete' || key === '0') to = EMPTY
  else return null
  if (to === from) return null
  return { index, from, to }
}

export const keyboard: KeyboardSupport = {
  count: (puzzle: Puzzle) => puzzle.width * puzzle.height,
  initial: () => 0,
  cursor: (state: GameState) => cursorOf(state),
  setCursor: (state: GameState, index: number | null) => setCursor(state, index),
  moveCursor: (state: GameState, puzzle: Puzzle, index: number | null, dx: number, dy: number) =>
    moveCursor(state, puzzle, index, dx, dy),
  input: (state: GameState, puzzle: Puzzle, index: number, key: string) =>
    keyboardInput(state, puzzle, index, key),
}
