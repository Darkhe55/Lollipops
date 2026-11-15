/**
 * 棒棒糖 —— 题库
 */

import type { Difficulty, GameState, Puzzle } from '../core/types'
import { RAW_PUZZLES } from './puzzles-data.ts'
import {
  EMPTY,
  asLollipopPuzzle,
  decodeBoard,
  givenType,
  type LollipopPuzzle,
  type LollipopState,
  type RawLollipopPuzzle,
} from './types.ts'

export function decodePuzzle(raw: RawLollipopPuzzle): LollipopPuzzle | null {
  const size = raw.width * raw.height
  if (raw.width <= 0 || raw.height <= 0) return null
  const givens = decodeBoard(raw.board, size)
  if (!givens) return null
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    difficulty: raw.difficulty as Difficulty,
    givens,
    solutionText: typeof raw.solution === 'string' ? raw.solution : '',
  }
}

export const builtinPuzzles: Puzzle[] = (RAW_PUZZLES as RawLollipopPuzzle[])
  .map(decodePuzzle)
  .filter((p): p is LollipopPuzzle => p !== null)

export function getReferenceSolution(id: string): GameState | null {
  const raw = (RAW_PUZZLES as RawLollipopPuzzle[]).find((p) => p.id === id)
  if (!raw || typeof raw.solution !== 'string' || !raw.solution) return null
  const puzzle = decodePuzzle(raw)
  if (!puzzle) return null
  const size = puzzle.width * puzzle.height
  const cells = decodeBoard(raw.solution, size)
  if (!cells) return null
  const givens = puzzle.givens.slice()
  for (let i = 0; i < size; i++) {
    if (givenType(givens[i]!) >= 0) cells[i] = givens[i]!
    else if (cells[i] === EMPTY) cells[i] = EMPTY
  }
  const state: LollipopState = {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    cells,
    givens,
    selected: 0,
  }
  return state
}

export function referenceFor(puzzle: Puzzle): GameState | null {
  const p = asLollipopPuzzle(puzzle)
  if (p.solutionText) {
    const size = p.width * p.height
    const cells = decodeBoard(p.solutionText, size)
    if (cells) {
      const givens = p.givens.slice()
      const state: LollipopState = {
        puzzleId: p.id,
        width: p.width,
        height: p.height,
        cells,
        givens,
        selected: 0,
      }
      return state
    }
  }
  return getReferenceSolution(p.id)
}

