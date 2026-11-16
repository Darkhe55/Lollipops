/**
 * ════════════════════════════════════════════════════════════════════
 *  棒棒糖（Lollipops）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 规则（来源见 README）：
 *   1. 一个棒棒糖 = 1 个圆头 + 相邻 1 格的棍子，共占 1×2 两格；
 *      横向相邻 = 圆头 + 横棍，纵向相邻 = 圆头 + 竖棍；
 *   2. 每个圆头 / 棍子都必须属于某个棒棒糖；
 *   3. 不同棒棒糖的格子不能上下左右相邻（斜角可以）；
 *   4. 同一行 / 列中，相邻（忽略空格）的两个同类符号之间必须有不同符号阻挡；
 *      圆头、横棍、竖棍是三种符号，黑圆与白圆视为同一符号。
 *
 * 盘面值：0 = 空，1 = 黑圆头，2 = 白圆头，3 = 横棍，4 = 竖棍。
 */

import { playDrop, playPluck } from '../core/audio.ts'
import type { CustomSupport, GameAdapter, Move, Puzzle, SolveResult } from '../core/types'
import { planLogicSolve } from './logic.ts'
import { builtinPuzzles, getReferenceSolution } from './puzzles.ts'
import { hitTest, metricsFor, renderBoard } from './render.ts'
import { countTypeSolutions, solvePuzzle } from './solver.ts'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  keyboard,
  rightClickValue,
  serializeState,
  stateMatchesPuzzle,
  valueAt,
} from './state.ts'
import { statusBits, validate } from './validate.ts'
import {
  BLACK,
  EMPTY,
  HSTICK,
  VSTICK,
  WHITE,
  decodeBoard,
  encodeBoard,
  asLollipopPuzzle,
  typesFromGivens,
  type LollipopPuzzle,
} from './types.ts'

const meta = {
  title: '棒棒糖',
  tagline: '圆头 + 一格棍子 · 同符号视线要阻挡 · 不同棒棒糖互不相触',
  footerNote:
    '规则：每个棒棒糖由「1 个圆头 + 相邻 1 格的棍子」组成，横向相邻配横棍、纵向相邻配竖棍；每个圆头/棍子都必须属于某个棒棒糖；不同棒棒糖的格子不能上下左右相邻；同一行/列中忽略空格后相邻的两个同类符号（圆头 / 横棍 / 竖棍，黑白圆算同类）之间必须隔着一个不同符号。题面预填符号不能改动。',
  storageKeyPrefix: 'lollipops',
  customIdPrefix: 'lollipops-custom-',
  customMinW: 4,
  customMinH: 4,
  customMaxW: 40,
  customMaxH: 40,
  targetKind: 'cell' as const,
  interactionHint:
    '<kbd>左键</kbd> 循环符号（空 → 黑圆头 → 白圆头 → 横棍 → 竖棍） · <kbd>右键</kbd> 清除 · <kbd>方向键</kbd> 移动光标 · <kbd>空格</kbd> 切换 · <kbd>1-4</kbd> 直接落子',
}

/** 自定义题板：编辑器里可填的值（null = 空格） */
const VALUE_CYCLE: Array<number | null> = [null, BLACK, WHITE, HSTICK, VSTICK]

function readGivens(value: unknown, size: number): number[] | null {
  if (typeof value === 'string') return decodeBoard(value, size)
  if (Array.isArray(value)) {
    if (value.length !== size) return null
    const out: number[] = []
    for (const v of value) {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 4) return null
      out.push(n)
    }
    return out
  }
  return null
}

const custom: CustomSupport = {
  mode: 'cell',
  valueCycle: VALUE_CYCLE,

  keyForDigit: (digit) => {
    if (digit === 0) return null
    if (digit === BLACK) return BLACK
    if (digit === WHITE) return WHITE
    if (digit === HSTICK) return HSTICK
    if (digit === VSTICK) return VSTICK
    return undefined
  },

  cellLabel: (v) => {
    if (v === BLACK) return '●'
    if (v === WHITE) return '○'
    if (v === HSTICK) return '━'
    if (v === VSTICK) return '┃'
    return ''
  },

  cellClass: (v) => {
    if (v === BLACK) return 'lp-v1'
    if (v === WHITE) return 'lp-v2'
    if (v === HSTICK) return 'lp-v3'
    if (v === VSTICK) return 'lp-v4'
    return ''
  },

  hint: '点格子循环：空 → 黑圆头 → 白圆头 → 横棍 → 竖棍；键盘 1-4 直接落子、0 清空。题面只需给出部分符号，剩下的由玩家补全。',

  toGrid: (p) => {
    const lp = asLollipopPuzzle(p)
    const size = p.width * p.height
    if (!Array.isArray(lp.givens) || lp.givens.length !== size) return null
    return {
      width: p.width,
      height: p.height,
      grid: lp.givens.map((v) => (v >= 1 && v <= 4 ? v : null)),
    }
  },

  makePuzzle: (w, h, grid, existingId) => {
    const givens = grid.map((v) => (typeof v === 'number' && v >= 1 && v <= 4 ? v : 0))
    return {
      id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
      name: `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      givens,
    } satisfies LollipopPuzzle
  },

  encodePuzzle: (p) => {
    const lp = asLollipopPuzzle(p)
    return { board: encodeBoard(lp.givens ?? []) }
  },

  decodePuzzle: (record) => {
    if (typeof record.id !== 'string') return null
    if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
    const w = record.width
    const h = record.height
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
    const givens = readGivens(record.board, w * h)
    if (!givens) return null
    return {
      id: record.id,
      name: typeof record.name === 'string' ? record.name : `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      givens,
    } satisfies LollipopPuzzle
  },

  /** 保存 / 载入自定义题时给出唯一解检查结果 */
  describe: (p) => {
    const lp = asLollipopPuzzle(p)
    const size = p.width * p.height
    if (!Array.isArray(lp.givens) || lp.givens.length !== size) return '题面数据不完整。'
    let clues = 0
    for (const v of lp.givens) if (v !== EMPTY) clues++
    if (clues === 0) return '题面还没有任何符号，先放几个圆头 / 棍子吧。'
    if (size > 144) return '棋盘较大，已跳过唯一解检查（可直接求解 / 逻辑解题）。'
    const out = countTypeSolutions(p.width, p.height, typesFromGivens(lp.givens), 2, 200_000)
    if (out.timedOut) return '唯一解检查超时（线索较少或棋盘较大）。'
    if (out.solutions.length === 0) return '题面无解：现有线索互相矛盾。'
    if (out.solutions.length === 1) return '符号类型层有唯一解，适合当正式题。'
    return '符号类型层有多解：自定义题允许，但提示 / 逻辑解题只保证给出一组解。'
  },
}

function playForMove(move: Move, streak: number): void {
  if (move.from === EMPTY) {
    // 圆头略高、棍子略低
    playPluck(streak, move.to === HSTICK || move.to === VSTICK ? 0.86 : 1.12)
  } else {
    playDrop(streak)
  }
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,

  keyboard,
  stateMatchesPuzzle,

  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  valueAt,
  serializeState,
  deserializeState,

  validate,
  statusBits,

  metricsFor,
  renderBoard,
  hitTest,

  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,

  custom,
  playForMove,
}
