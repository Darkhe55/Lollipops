/**
 * 棒棒糖 —— SVG 渲染与命中
 *
 * 视觉：
 *   - 淡色棋盘底 + 细网格；
 *   - 已连成的棒棒糖画一条糖果色「棒子」底衬（把一对格子连起来）；
 *   - 白圆头 / 横棍（━）/ 竖棍（┃）/ 红叉（右键标记空地）；
 *   - 预填格左上角小圆点 + 米色底；
 *   - 错误格红色蒙层；视线冲突画红色虚线；
 *   - 键盘光标虚线框。
 */

import type { BoardMetrics, GameState, HitTarget, Puzzle, ValidationResult } from '../core/types'
import {
  CROSS,
  HSTICK,
  VSTICK,
  WHITE,
  T_EMPTY,
  asLollipopState,
  canPair,
  makeGeo,
  typeOf,
  type LollipopResult,
} from './types.ts'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  const cell = 56
  const pad = 22
  return {
    cell,
    pad,
    width: puzzle.width,
    height: puzzle.height,
    svgWidth: pad * 2 + puzzle.width * cell,
    svgHeight: pad * 2 + puzzle.height * cell,
    k: 1,
  }
}

function cellPos(m: BoardMetrics, index: number): { x: number; y: number } {
  return {
    x: m.pad + (index % m.width) * m.cell,
    y: m.pad + Math.floor(index / m.width) * m.cell,
  }
}

function centerOf(m: BoardMetrics, index: number): { x: number; y: number } {
  const p = cellPos(m, index)
  return { x: p.x + m.cell / 2, y: p.y + m.cell / 2 }
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
  _colorGrid?: unknown,
): string {
  const m = metricsFor(puzzle)
  const s = asLollipopState(state)
  const r = result as LollipopResult
  const w = puzzle.width
  const h = puzzle.height
  const geo = makeGeo(w, h)
  const cells = s.cells
  const givens = s.givens ?? []
  const cell = m.cell
  const bad = new Set<number>(r.badCells ?? [])
  const cursor = typeof s.selected === 'number' ? s.selected : -1

  const parts: string[] = []

  // 棋盘底
  parts.push(
    `<rect class="lp-board-bg" x="2" y="2" width="${(m.svgWidth - 4).toFixed(2)}" height="${(m.svgHeight - 4).toFixed(2)}" rx="${(cell * 0.28).toFixed(2)}" />`,
  )

  // 网格线
  const grid: string[] = []
  for (let x = 0; x <= w; x++) {
    const px = m.pad + x * cell
    grid.push(
      `<line class="lp-grid-line" x1="${px}" y1="${m.pad}" x2="${px}" y2="${m.pad + h * cell}" />`,
    )
  }
  for (let y = 0; y <= h; y++) {
    const py = m.pad + y * cell
    grid.push(
      `<line class="lp-grid-line" x1="${m.pad}" y1="${py}" x2="${m.pad + w * cell}" y2="${py}" />`,
    )
  }
  parts.push(`<g class="lp-grid">${grid.join('')}</g>`)

  // 预填格底色
  const tint: string[] = []
  for (let i = 0; i < w * h; i++) {
    if ((givens[i] ?? 0) === 0) continue
    const p = cellPos(m, i)
    tint.push(
      `<rect class="lp-given-tint" x="${(p.x + 1.5).toFixed(2)}" y="${(p.y + 1.5).toFixed(2)}" width="${(cell - 3).toFixed(2)}" height="${(cell - 3).toFixed(2)}" rx="${(cell * 0.14).toFixed(2)}" />`,
    )
  }
  parts.push(`<g class="lp-given-tints">${tint.join('')}</g>`)

  // 已连成的棒棒糖底衬（只画合法配对）
  const candy: string[] = []
  const pairedWith = new Map<number, number>()
  for (let i = 0; i < w * h; i++) {
    const t = typeOf(cells[i] ?? 0)
    if (t === T_EMPTY) continue
    let partner = -1
    for (const { j, dir } of geo.neighbors[i]!) {
      if (typeOf(cells[j] ?? 0) === T_EMPTY) continue
      if (canPair(t, typeOf(cells[j] ?? 0), dir)) {
        partner = j
        break
      }
    }
    if (partner < 0) continue
    const pair = pairedWith.get(i)
    if (pair !== undefined) continue
    pairedWith.set(i, partner)
    pairedWith.set(partner, i)
    const a = centerOf(m, i)
    const b = centerOf(m, partner)
    candy.push(
      `<line class="lp-candy" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke-width="${(cell * 0.18).toFixed(2)}" />`,
    )
  }
  parts.push(`<g class="lp-candies">${candy.join('')}</g>`)

  // 每格符号
  for (let i = 0; i < w * h; i++) {
    const v = cells[i] ?? 0
    const p = cellPos(m, i)
    const c = centerOf(m, i)
    const given = (givens[i] ?? 0) !== 0
    const items: string[] = []
    if (given) {
      items.push(
        `<circle class="lp-given-dot" cx="${(p.x + cell - 8).toFixed(2)}" cy="${(p.y + 8).toFixed(2)}" r="${(cell * 0.055).toFixed(2)}" />`,
      )
    }
    if (v === WHITE) {
      const rad = cell * 0.3
      items.push(
        `<circle class="lp-head lp-head-white" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${rad.toFixed(2)}" stroke-width="${(cell * 0.06).toFixed(2)}" />`,
      )
    } else if (v === HSTICK) {
      items.push(
        `<rect class="lp-stick" x="${(c.x - cell * 0.35).toFixed(2)}" y="${(c.y - cell * 0.09).toFixed(2)}" width="${(cell * 0.7).toFixed(2)}" height="${(cell * 0.18).toFixed(2)}" rx="${(cell * 0.09).toFixed(2)}" />`,
      )
    } else if (v === VSTICK) {
      items.push(
        `<rect class="lp-stick" x="${(c.x - cell * 0.09).toFixed(2)}" y="${(c.y - cell * 0.35).toFixed(2)}" width="${(cell * 0.18).toFixed(2)}" height="${(cell * 0.7).toFixed(2)}" rx="${(cell * 0.09).toFixed(2)}" />`,
      )
    } else if (v === CROSS) {
      const r = cell * 0.24
      items.push(
        `<line class="lp-cross" x1="${(c.x - r).toFixed(2)}" y1="${(c.y - r).toFixed(2)}" x2="${(c.x + r).toFixed(2)}" y2="${(c.y + r).toFixed(2)}" />`,
      )
      items.push(
        `<line class="lp-cross" x1="${(c.x + r).toFixed(2)}" y1="${(c.y - r).toFixed(2)}" x2="${(c.x - r).toFixed(2)}" y2="${(c.y + r).toFixed(2)}" />`,
      )
    }
    const cls = bad.has(i) ? 'lp-cell bad' : 'lp-cell'
    parts.push(`<g class="${cls}" data-index="${i}">${items.join('')}</g>`)
  }

  // 错误蒙层
  const badRects: string[] = []
  for (const i of bad) {
    const p = cellPos(m, i)
    badRects.push(
      `<rect class="lp-bad" x="${(p.x + 1.5).toFixed(2)}" y="${(p.y + 1.5).toFixed(2)}" width="${(cell - 3).toFixed(2)}" height="${(cell - 3).toFixed(2)}" rx="${(cell * 0.14).toFixed(2)}" />`,
    )
  }
  parts.push(`<g class="lp-bad-layer">${badRects.join('')}</g>`)

  // 视线冲突虚线
  const sight: string[] = []
  for (const pair of r.sightConflicts ?? []) {
    const a = centerOf(m, pair.a)
    const b = centerOf(m, pair.b)
    sight.push(
      `<line class="lp-sight" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke-width="${(cell * 0.05).toFixed(2)}" />`,
    )
  }
  parts.push(`<g class="lp-sight-layer">${sight.join('')}</g>`)

  // 键盘光标
  if (cursor >= 0 && cursor < w * h) {
    const p = cellPos(m, cursor)
    parts.push(
      `<rect class="lp-cursor" x="${(p.x + 2).toFixed(2)}" y="${(p.y + 2).toFixed(2)}" width="${(cell - 4).toFixed(2)}" height="${(cell - 4).toFixed(2)}" rx="${(cell * 0.13).toFixed(2)}" stroke-width="${(cell * 0.05).toFixed(2)}" />`,
    )
  }

  // 命中层
  const hits: string[] = []
  for (let i = 0; i < w * h; i++) {
    const p = cellPos(m, i)
    hits.push(
      `<rect class="cell-hit" data-index="${i}" x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" width="${cell}" height="${cell}" />`,
    )
  }
  parts.push(`<g class="lp-hit-layer">${hits.join('')}</g>`)

  return `<svg class="board-svg lp-board" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(
  m: BoardMetrics,
  puzzle: Puzzle,
  x: number,
  y: number,
): HitTarget | null {
  const col = Math.floor((x - m.pad) / m.cell)
  const row = Math.floor((y - m.pad) / m.cell)
  if (col < 0 || row < 0 || col >= puzzle.width || row >= puzzle.height) return null
  return { index: row * puzzle.width + col }
}


