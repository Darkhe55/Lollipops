/**
 * 棒棒糖题库审计（npm run check）
 *
 * 直接 import 游戏适配器（Node 24 原生 TypeScript 支持），做深度检查：
 *   1. 题库结构：id 唯一、宽高合法、难度合法、题面/解编码长度正确；
 *   2. 参考解：题面 givens 与参考解一致，且 validate(...).solved === true；
 *   3. 唯一解：类型层枚举解的个数必须恰好为 1（不算黑白圆头颜色差异）；
 *   4. 逻辑可推：planLogicSolve 能推满（saturated），回放帧落到盘面后校验通过；
 *   5. 求解器：solvePuzzle 能给出通过校验的解；
 *   6. 自定义题板编解码往返 + 键盘光标/落子接口。
 */

import { adapter } from '../src/game/adapter.ts'
import { countTypeSolutions } from '../src/game/solver.ts'
import {
  EMPTY,
  asLollipopPuzzle,
  typesFromGivens,
  typeOf,
} from '../src/game/types.ts'

let errors = 0
let warnings = 0

function fail(message) {
  console.error(`[check] ✗ ${message}`)
  errors++
}

function warn(message) {
  console.warn(`[check] ! ${message}`)
  warnings++
}

const ids = new Set()
const puzzles = adapter.builtinPuzzles
console.log(`[check] 内置题库 ${puzzles.length} 题`)

if (puzzles.length < 6) fail(`内置题只有 ${puzzles.length} 道，至少需要 6 道`)

for (const puzzle of puzzles) {
  const p = asLollipopPuzzle(puzzle)
  const size = p.width * p.height
  const tag = `${p.id} ${p.width}×${p.height}`

  if (ids.has(p.id)) fail(`${tag} 重复 id`)
  ids.add(p.id)
  if (!p.name) fail(`${tag} 缺 name`)
  if (!['easy', 'medium', 'hard', 'custom'].includes(p.difficulty)) {
    fail(`${tag} 难度非法：${p.difficulty}`)
  }
  if (p.width <= 0 || p.height <= 0) fail(`${tag} 宽高非法`)
  if (!Array.isArray(p.givens) || p.givens.length !== size) {
    fail(`${tag} givens 长度不是 ${size}`)
    continue
  }
  let clues = 0
  for (const v of p.givens) {
    if (!Number.isInteger(v) || v < 0 || v > 4) fail(`${tag} givens 含非法值 ${v}`)
    if (v !== EMPTY) clues++
  }
  if (clues < 4) warn(`${tag} 线索只有 ${clues} 个`)

  // ② 参考解
  const ref = adapter.getReferenceSolution(p.id)
  if (!ref) {
    fail(`${tag} 缺参考解`)
    continue
  }
  const refState = ref
  const refResult = adapter.validate(refState, puzzle)
  if (!refResult.solved) {
    fail(`${tag} 参考解未通过 validate：${adapter.statusBits(refResult).join(' / ')}`)
    continue
  }
  let givensOk = true
  for (let i = 0; i < size; i++) {
    const g = p.givens[i] ?? 0
    if (g !== 0 && refState.cells[i] !== g) {
      fail(`${tag} 参考解第 ${i} 格与题面 givens 不一致`)
      givensOk = false
      break
    }
  }
  if (!givensOk) continue
  const refTypes = refState.cells.map((v) => typeOf(v))

  // ③ 唯一解（类型层）
  const counted = countTypeSolutions(p.width, p.height, typesFromGivens(p.givens), 3, 2_000_000)
  if (counted.timedOut) {
    fail(`${tag} 唯一解检查超时（${counted.nodes} 节点）`)
    continue
  }
  if (counted.solutions.length !== 1) {
    fail(`${tag} 解不唯一：找到 ${counted.solutions.length} 个`)
    continue
  }
  const only = counted.solutions[0]
  for (let i = 0; i < size; i++) {
    if (only[i] !== refTypes[i]) {
      fail(`${tag} 参考解不是唯一解（第 ${i} 格类型不同）`)
      givensOk = false
      break
    }
  }
  if (!givensOk) continue

  // ④ 逻辑解题计划
  const empty = adapter.createEmptyState(puzzle)
  const plan = adapter.planLogicSolve(puzzle, empty)
  if (!plan.frames.length) fail(`${tag} 逻辑解题没有产生回放帧`)
  if (!plan.saturated) warn(`${tag} 逻辑推演未饱和（靠回溯补完）`)
  const playback = adapter.cloneState(empty)
  for (const frame of plan.frames) adapter.applyMove(playback, frame.move)
  const playbackResult = adapter.validate(playback, puzzle)
  if (!playbackResult.solved) {
    fail(`${tag} 逻辑回放后未通过校验：${adapter.statusBits(playbackResult).join(' / ')}`)
  }
  if (!plan.finalState) {
    fail(`${tag} 逻辑计划缺 finalState`)
  } else {
    const finalResult = adapter.validate(plan.finalState, puzzle)
    if (!finalResult.solved) fail(`${tag} 逻辑计划 finalState 未通过校验`)
  }

  // ⑤ 回溯求解器
  const solved = adapter.solvePuzzle(puzzle, 2_000_000)
  if (!solved.solved || !solved.solution) {
    fail(`${tag} 求解器求解失败${solved.timedOut ? '（超时）' : ''}`)
  } else {
    const solvedResult = adapter.validate(solved.solution, puzzle)
    if (!solvedResult.solved) fail(`${tag} 求解器给出的解未通过校验`)
  }

  // ⑥ 键盘接口
  if (adapter.keyboard) {
    const kb = adapter.keyboard
    const state = adapter.createEmptyState(puzzle)
    const cur = kb.cursor(state)
    if (cur === null) fail(`${tag} 键盘光标未初始化`)
    else {
      const moved = kb.moveCursor(state, puzzle, cur, 1, 0)
      if (moved === null) fail(`${tag} 键盘光标无法移动`)
      kb.setCursor(state, cur)
      const move = kb.input(state, puzzle, cur, ' ')
      if (!move && (p.givens[cur] ?? 0) === 0) fail(`${tag} 键盘空格没有落子`)
    }
  }

  console.log(
    `[check] ✓ ${tag} 「${p.name}」线索 ${clues} · 唯一解 · 逻辑 ${plan.frames.length} 帧/${plan.ruleSteps} 步 · 搜索 ${counted.nodes} 节点`,
  )
}

// ⑦ 自定义题板编解码与状态
{
  const grid = [
    null, 1, null, null, null,
    null, 3, null, null, null,
    null, null, null, null, null,
    null, null, 2, null, null,
    null, null, null, null, 4,
  ]
  const customPuzzle = adapter.custom.makePuzzle(5, 5, grid, 'lollipops-custom-test')
  const record = { ...adapter.custom.encodePuzzle(customPuzzle), id: customPuzzle.id, name: customPuzzle.name, width: 5, height: 5, difficulty: 'custom' }
  const decoded = adapter.custom.decodePuzzle(record)
  if (!decoded) {
    fail('自定义题板编解码失败')
  } else {
    if (decoded.width !== 5 || decoded.height !== 5) fail('自定义题板宽高还原错误')
    const back = adapter.custom.toGrid(decoded)
    if (!back) fail('自定义题板 toGrid 失败')
    else {
      for (let i = 0; i < 25; i++) {
        if ((grid[i] ?? null) !== (back.grid[i] ?? null)) {
          fail(`自定义题板第 ${i} 格还原不一致`)
          break
        }
      }
    }
    const state = adapter.createEmptyState(decoded)
    if (state.cells.filter((v) => v !== 0).length !== 4) fail('自定义题板给定数还原错误')
  }
  if (!Array.isArray(adapter.custom.valueCycle) || adapter.custom.valueCycle.length < 3) {
    fail('自定义题板 valueCycle 太短')
  }
}

// ⑧ 内置题尺寸约束（自定义上限 20×20 的说明一致性）
for (const p of puzzles) {
  if (p.width > 20 || p.height > 20) fail(`${p.id} 超过 20×20 上限`)
}

console.log(`[check] 完成：${puzzles.length} 题，错误 ${errors}，警告 ${warnings}`)
if (errors > 0) process.exitCode = 1
