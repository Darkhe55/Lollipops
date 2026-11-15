/**
 * 棒棒糖 —— 逻辑解题回放计划
 *
 * 推理分两层：
 *   1. 规则传播（engine.ts）：唯一搭档 / 相邻排除 / 视线阻挡；
 *   2. 反证探测：卡住时对候选最少的未知格逐个试值，
 *      用回溯求解器判断「该取值是否还能补全」；只有一种取值可行时即为必然结论。
 *      题库的唯一解题一定能被这样推完（README 有说明）。
 *
 * 计划生成后把推导事件转成回放帧：已经和推导结果一致的格子不再落子；
 * 若玩家盘面里有错误符号，会用「清除 / 改写」帧一并纠正。
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import {
  assign,
  firstUnknown,
  isComplete,
  makeEngine,
  propagate,
  RULE_FALLBACK,
  RULE_LABELS,
  RULE_PROBE,
  typesOf,
  type EngineState,
} from './engine.ts'
import { countTypeSolutions, findTypeSolution, hasSolution } from './solver.ts'
import {
  BLACK,
  EMPTY,
  T_EMPTY,
  T_HEAD,
  asLollipopPuzzle,
  asLollipopState,
  makeGeo,
  typeOf,
  typesFromGivens,
  valueOfType,
  type LollipopState,
} from './types.ts'

const PROBE_ORDER = [1, 2, 3, 0] // 类型层：圆头 / 横棍 / 竖棍 / 空

/** 选一个「候选最少」的未知格来做反证 */
function pickProbeCell(est: EngineState): number {
  const { geo, val } = est
  let best = firstUnknown(est)
  let bestScore = -1
  for (let i = 0; i < geo.n; i++) {
    if (val[i]! !== -1) continue
    let assigned = 0
    for (const { j } of geo.neighbors[i]!) if (val[j]! > 0) assigned++
    if (assigned > bestScore) {
      bestScore = assigned
      best = i
      if (assigned >= 3) break
    }
  }
  return best
}

/** 只用规则传播 + 反证推导出完整类型解；返回 null 表示推不出来 */
export function deduceTypes(
  puzzle: Puzzle,
): { types: number[]; events: import('./engine.ts').Deduction[]; saturated: boolean } | null {
  const p = asLollipopPuzzle(puzzle)
  const size = p.width * p.height
  if (p.givens.length !== size) return null
  const geo = makeGeo(p.width, p.height)
  const est = makeEngine(geo, typesFromGivens(p.givens), true)
  if (!propagate(est)) return null

  const unique = (() => {
    const out = countTypeSolutions(p.width, p.height, typesFromGivens(p.givens), 2, 400_000)
    return !out.timedOut && out.solutions.length === 1
  })()

  let saturated = true
  let guard = 0
  while (!isComplete(est) && guard++ < geo.n * 2) {
    const idx = pickProbeCell(est)
    if (idx < 0) break
    const feasible: number[] = []
    for (const v of PROBE_ORDER) {
      const trial = est.val.slice()
      trial[idx] = v
      const ok = hasSolution(p.width, p.height, trial, 400_000)
      if (ok) {
        feasible.push(v)
        // 唯一解题：第一个可行值就是必然结论，无需再试
        if (unique) break
      }
    }
    if (feasible.length === 0) return null
    if (feasible.length === 1) {
      if (!assign(est, idx, feasible[0]!, RULE_PROBE)) return null
      if (!propagate(est)) return null
      continue
    }
    // 多解题：直接用一个完整解补完
    const sol = findTypeSolution(p.width, p.height, est.val, 600_000)
    if (!sol) return null
    for (let i = 0; i < geo.n; i++) {
      if (est.val[i]! === -1) {
        if (!assign(est, i, sol[i]!, RULE_FALLBACK)) return null
      }
    }
    saturated = false
    break
  }

  if (!isComplete(est)) {
    const sol = findTypeSolution(p.width, p.height, est.val, 800_000)
    if (!sol) return null
    for (let i = 0; i < geo.n; i++) {
      if (est.val[i]! === -1) {
        if (!assign(est, i, sol[i]!, RULE_FALLBACK)) return null
      }
    }
    saturated = false
  }

  return { types: typesOf(est), events: est.events ?? [], saturated }
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asLollipopPuzzle(puzzle)
  const s = asLollipopState(initialState)
  const emptyPlan: LogicPlan = {
    puzzleId: p.id,
    frames: [],
    finalState: null,
    ruleSteps: 0,
    saturated: false,
  }

  const deduced = deduceTypes(puzzle)
  if (!deduced) return emptyPlan

  const display = s.cells.slice()
  const frames: PlaybackFrame[] = []
  let lastRule = -1
  let streak = 0

  const solveValueAt = (index: number, type: number): number => {
    if (type === T_HEAD) {
      const given = p.givens[index] ?? EMPTY
      if (given === 1 || given === 2) return given
      // 保留玩家已经放好的同类圆头颜色
      const cur = display[index] ?? EMPTY
      if (typeOf(cur) === T_HEAD) return cur
      return BLACK
    }
    return valueOfType(type)
  }

  const emit = (index: number, type: number, rule: number, label: string): void => {
    const cur = display[index] ?? EMPTY
    const curType = typeOf(cur)
    if (curType === type) return
    const to = solveValueAt(index, type)
    if (to === cur) return
    if (rule === lastRule) streak++
    else {
      lastRule = rule
      streak = 1
    }
    const move: Move = { index, from: cur, to }
    display[index] = to
    frames.push({ rule, label, move, streak })
  }

  for (const ev of deduced.events) {
    emit(ev.index, ev.type, ev.rule, RULE_LABELS[ev.rule] ?? ev.label)
  }

  // 保底：确保最终盘面与推导结果一致（理论上事件已覆盖）
  for (let i = 0; i < display.length; i++) {
    const want = deduced.types[i] ?? T_EMPTY
    if (typeOf(display[i] ?? EMPTY) !== want) {
      emit(i, want, RULE_FALLBACK, RULE_LABELS[RULE_FALLBACK]!)
    }
  }

  const finalState: LollipopState = {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells: display,
    givens: p.givens.slice(),
    selected: typeof s.selected === 'number' ? s.selected : 0,
  }

  return {
    puzzleId: p.id,
    frames,
    finalState,
    ruleSteps: deduced.events.length,
    saturated: deduced.saturated,
  }
}
