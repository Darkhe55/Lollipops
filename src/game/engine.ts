/**
 * 棒棒糖 —— 规则推理 / 传播引擎（类型层）
 *
 * 类型层编码：-1 = 未知，0 = 空，1 = 圆头，2 = 横棍，3 = 竖棍。
 *
 * 一个符号格必须恰好有 1 个上下左右相邻的符号格，且两者构成
 * 「圆头 + 朝向正确的棍子」。传播规则：
 *
 *   R1 唯一搭档：某个符号格只剩一个可配对的相邻格 → 直接配对；
 *   R2 相邻排除：棒棒糖之外、与该棒棒糖相邻的格子必须留空；
 *                一个格子若接触 2 个符号格，必然留空；
 *                朝向不兼容的相邻格也必然留空；
 *   R3 视线阻挡：同一行/列里相邻（忽略空格）的两个符号类型不能相同；
 *   R6 2×2 局部：一个 2×2 最多两个符号；相邻两符号必须配对；对角两符号的另外两格必须为空；
 *      一个符号若没有任何可配对方向（圆头/横棍/竖棍的轴向都不行）→ 矛盾；
 *   R7 行/列视线：用每格候选域做行/列 DP，同类符号之间必须隔一个不同符号；
 *   R8 配对可行性：未配对符号到候选搭档的 Hall 必要性检查（候选不足即矛盾）。
 *
 * 求解器与逻辑解题回放共用本文件。
 */

import type { Geo } from './types.ts'
import {
  DIR_H,
  T_EMPTY,
  T_HEAD,
  T_H,
  T_V,
  canPair,
  makeGeo,
  partnerTypeOf,
} from './types.ts'

/** 规则编号（回放状态栏显示） */
export const RULE_PAIR = 1
export const RULE_ADJ = 2
export const RULE_SIGHT = 3
export const RULE_PROBE = 4
export const RULE_FALLBACK = 5
export const RULE_LOCAL = 6
export const RULE_LINE = 7

export const RULE_LABELS: Record<number, string> = {
  1: '唯一搭档：这个符号只剩一个可配对的相邻格',
  2: '相邻排除：棒棒糖旁的格子必须留空，一个格子不能接触两个棒棒糖',
  3: '视线阻挡：同排同列的同类符号之间必须隔一个不同符号',
  4: '反证：假定该格为其它符号都会导致矛盾',
  5: '回溯补完：剩下的格子由求解结果确定',
  6: '2×2 局部：相邻符号必须配对、对角符号两侧留空、三符号必矛盾',
  7: '行/列视线：同类符号之间必须隔一个不同符号',
}

export interface Deduction {
  index: number
  type: number
  rule: number
  label: string
}

export interface EngineState {
  geo: Geo
  /** 每格类型：-1 未知 / 0 空 / 1 圆头 / 2 横棍 / 3 竖棍 */
  val: Int8Array
  /** 候选域位掩码：bit0 空 / bit1 圆头 / bit2 横棍 / bit3 竖棍 */
  dom: Uint8Array
  /** 每格搭档索引；-1 表示还没有搭档 */
  partner: Int16Array
  /** 记录推导事件（求解时传 null 以加速） */
  events: Deduction[] | null
  changed: boolean
}

export const DOM_EMPTY = 1
export const DOM_HEAD = 2
export const DOM_H = 4
export const DOM_V = 8
export const DOM_ALL = DOM_EMPTY | DOM_HEAD | DOM_H | DOM_V

function domBit(type: number): number {
  return type === T_EMPTY ? DOM_EMPTY : type === T_HEAD ? DOM_HEAD : type === T_H ? DOM_H : DOM_V
}

export function makeEngine(geo: Geo, initial: ArrayLike<number>, record: boolean): EngineState {
  const val = new Int8Array(geo.n)
  const dom = new Uint8Array(geo.n)
  const partner = new Int16Array(geo.n)
  for (let i = 0; i < geo.n; i++) {
    const v = initial[i] ?? -1
    if (v >= 0 && v <= 3) {
      val[i] = v
      dom[i] = domBit(v)
    } else {
      val[i] = -1
      dom[i] = DOM_ALL
    }
    partner[i] = -1
  }
  return { geo, val, dom, partner, events: record ? [] : null, changed: false }
}

export function cloneEngine(est: EngineState, record: boolean): EngineState {
  return {
    geo: est.geo,
    val: est.val.slice(),
    dom: est.dom.slice(),
    partner: est.partner.slice(),
    events: record ? [] : null,
    changed: false,
  }
}

function emit(est: EngineState, index: number, type: number, rule: number): void {
  if (!est.events) return
  est.events.push({ index, type, rule, label: RULE_LABELS[rule] ?? '' })
}

/** 写入一个确定的类型；已相同返回 true，冲突返回 false */
export function assign(est: EngineState, index: number, type: number, rule: number): boolean {
  const cur = est.val[index]!
  if (cur === type) return true
  if (cur !== -1) return false
  const bit = domBit(type)
  if ((est.dom[index]! & bit) === 0) return false
  est.val[index] = type
  est.dom[index] = bit
  est.changed = true
  emit(est, index, type, rule)
  return true
}

/** 收缩候选域；只剩一个类型时自动落子并记录回放事件。 */
export function restrict(est: EngineState, index: number, mask: number, rule: number): boolean {
  const cur = est.val[index]!
  if (cur !== -1) return (domBit(cur) & mask) !== 0
  const next = est.dom[index]! & mask
  if (next === 0) return false
  if (next === est.dom[index]) return true
  est.dom[index] = next
  est.changed = true
  if ((next & (next - 1)) === 0) {
    const type = next === DOM_EMPTY ? T_EMPTY : next === DOM_HEAD ? T_HEAD : next === DOM_H ? T_H : T_V
    return assign(est, index, type, rule)
  }
  return true
}

function forceEmpty(est: EngineState, index: number, rule = RULE_ADJ): boolean {
  const cur = est.val[index]!
  if (cur === T_EMPTY) return true
  if (cur !== -1) return false
  return assign(est, index, T_EMPTY, rule)
}

function pair(est: EngineState, i: number, j: number, dir: number, rule = RULE_PAIR): boolean {
  const need = partnerTypeOf(est.val[i]!, dir)
  if (need < 0) return false
  if (est.partner[i]! >= 0 || est.partner[j]! >= 0) return false
  const cur = est.val[j]!
  if (cur === -1) {
    if (!assign(est, j, need, rule)) return false
  } else if (cur !== need) {
    return false
  }
  est.partner[i] = j
  est.partner[j] = i
  for (const { j: k } of est.geo.neighbors[i]!) {
    if (k === j) continue
    if (!forceEmpty(est, k, rule)) return false
  }
  for (const { j: k } of est.geo.neighbors[j]!) {
    if (k === i) continue
    if (!forceEmpty(est, k, rule)) return false
  }
  return true
}

/* ────────────────────────── 单轮传播 ────────────────────────── */

function passLocal(est: EngineState): boolean {
  const { geo, val, partner } = est
  const { w, h } = geo
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      const cells = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1]
      const symbols = cells.filter((i) => val[i]! > 0)
      if (symbols.length >= 3) return false
      if (symbols.length !== 2) continue
      const [a, b] = symbols
      const row = Math.floor(a! / w)
      const col = a! % w
      const rowB = Math.floor(b! / w)
      const colB = b! % w
      const adjacent = Math.abs(row - rowB) + Math.abs(col - colB) === 1
      if (adjacent) {
        if (partner[a!] === b && partner[b!] === a) continue
        if (partner[a!]! >= 0 || partner[b!]! >= 0) return false
        const dir = row === rowB ? 0 : 1
        if (!pair(est, a!, b!, dir, RULE_LOCAL)) return false
      } else {
        // 两个符号在 2×2 里对角：另外两格必须为空，否则会变成 3 个符号
        for (const i of cells) {
          if (i === a || i === b) continue
          if (val[i]! > 0) return false
          if (!forceEmpty(est, i, RULE_LOCAL)) return false
        }
      }
    }
  }
  return true
}

function passPairing(est: EngineState): boolean {
  const { geo, val, partner } = est
  for (let i = 0; i < geo.n; i++) {
    const t = val[i]!
    if (t <= 0 || partner[i]! >= 0) continue

    let assignedCand = -1
    let assignedCount = 0
    let undecidedCand = -1
    let undecidedCount = 0
    let assignedDir = -1
    let undecidedDir = -1

    for (const { j, dir } of geo.neighbors[i]!) {
      const vj = val[j]!
      if (vj > 0) {
        if (partner[j]! >= 0) return false
        if (!canPair(t, vj, dir)) return false
        assignedCount++
        assignedCand = j
        assignedDir = dir
      } else if (vj === -1) {
        const need = partnerTypeOf(t, dir)
        if (need < 0) {
          // 朝向不兼容：这个相邻格不能属于同一个棒棒糖，必须留空
          if (!restrict(est, j, DOM_EMPTY, RULE_ADJ)) return false
        } else {
          // 与已知符号相邻的格子只能是空，或正好是这个符号需要的搭档类型
          const allowed = DOM_EMPTY | domBit(need)
          if (!restrict(est, j, allowed, RULE_ADJ)) return false
          if ((est.dom[j]! & domBit(need)) === 0) continue
          if (est.val[j]! === need) {
            assignedCount++
            assignedCand = j
            assignedDir = dir
          } else {
            undecidedCount++
            undecidedCand = j
            undecidedDir = dir
          }
        }
      }
    }

    if (assignedCount > 1) return false
    if (assignedCount === 1) {
      if (!pair(est, i, assignedCand, assignedDir)) return false
    } else if (undecidedCount === 1) {
      if (!pair(est, i, undecidedCand, undecidedDir)) return false
    } else if (assignedCount === 0 && undecidedCount === 0) {
      // 没有任何可配对方向：圆头/棍子无法归入棒棒糖
      return false
    }
  }
  return true
}

function passEmptyForcing(est: EngineState): boolean {
  const { geo, val, partner } = est
  for (let i = 0; i < geo.n; i++) {
    if (val[i]! !== -1) continue
    let count = 0
    let single = -1
    let singleDir = -1
    for (const { j, dir } of geo.neighbors[i]!) {
      if (val[j]! > 0) {
        count++
        single = j
        singleDir = dir
      }
    }
    if (count >= 2) {
      if (!assign(est, i, T_EMPTY, RULE_ADJ)) return false
    } else if (count === 1) {
      if (partner[single]! >= 0) {
        if (!assign(est, i, T_EMPTY, RULE_ADJ)) return false
      } else if (partnerTypeOf(val[single]!, singleDir) < 0) {
        if (!assign(est, i, T_EMPTY, RULE_ADJ)) return false
      }
    }
  }
  return true
}

function passSight(est: EngineState): boolean {
  const { geo, val } = est
  for (let line = 0; line < 2; line++) {
    const count = line === 0 ? geo.h : geo.w
    const len = line === 0 ? geo.w : geo.h
    for (let idx = 0; idx < count; idx++) {
      let prev = -1
      let unknownBetween = 0
      for (let k = 0; k < len; k++) {
        const i = line === 0 ? idx * geo.w + k : k * geo.w + idx
        const v = val[i]!
        if (v === -1) {
          unknownBetween++
          continue
        }
        if (v === T_EMPTY) continue
        if (prev >= 0) {
          if (val[prev] === v && unknownBetween === 0) return false
        }
        prev = i
        unknownBetween = 0
      }
    }
  }
  return true
}

function passLineSight(est: EngineState): boolean {
  const { geo, dom } = est
  const { w, h } = geo
  for (let line = 0; line < 2; line++) {
    const count = line === 0 ? h : w
    const len = line === 0 ? w : h
    const idx = (k: number): number => (line === 0 ? k : k * w + k === -1 ? -1 : -1)
    void idx
    for (let row = 0; row < count; row++) {
      const positions: number[] = []
      for (let k = 0; k < len; k++) positions.push(line === 0 ? row * w + k : k * w + row)
      const n = positions.length
      const forward = new Uint8Array(n + 1)
      forward[0] = 1 // state 0 = 还没有符号
      for (let pos = 0; pos < n; pos++) {
        const d = dom[positions[pos]! ]!
        for (let s = 0; s < 4; s++) {
          if ((forward[pos]! & (1 << s)) === 0) continue
          for (let type = 0; type < 4; type++) {
            if ((d & (1 << type)) === 0) continue
            if (type !== 0 && s !== 0 && type === s) continue
            const ns = type === 0 ? s : type
            forward[pos + 1]! |= 1 << ns
          }
        }
      }
      const backward = new Uint8Array(n + 1)
      backward[n] = 0b1111
      for (let pos = n - 1; pos >= 0; pos--) {
        const d = dom[positions[pos]! ]!
        for (let s = 0; s < 4; s++) {
          for (let type = 0; type < 4; type++) {
            if ((d & (1 << type)) === 0) continue
            if (type !== 0 && s !== 0 && type === s) continue
            const ns = type === 0 ? s : type
            if ((backward[pos + 1]! & (1 << ns)) !== 0) {
              backward[pos]! |= 1 << s
              break
            }
          }
        }
      }
      for (let pos = 0; pos < n; pos++) {
        const d = dom[positions[pos]! ]!
        let support = 0
        for (let s = 0; s < 4; s++) {
          if ((forward[pos]! & (1 << s)) === 0) continue
          for (let type = 0; type < 4; type++) {
            if ((d & (1 << type)) === 0) continue
            if (type !== 0 && s !== 0 && type === s) continue
            const ns = type === 0 ? s : type
            if ((backward[pos + 1]! & (1 << ns)) !== 0) support |= 1 << type
          }
        }
        if (!restrict(est, positions[pos]!, support, RULE_LINE)) return false
      }
    }
  }
  return true
}

function passHall(est: EngineState): boolean {
  const { geo, val, dom, partner } = est
  const symbols: number[] = []
  for (let i = 0; i < geo.n; i++) if (val[i]! > 0 && partner[i]! < 0) symbols.push(i)
  if (!symbols.length) return true
  const candidates = symbols.map((i) => {
    const out: number[] = []
    for (const { j, dir } of geo.neighbors[i]!) {
      const need = partnerTypeOf(val[i]!, dir)
      if (need < 0) continue
      if (val[j] === -1) {
        if ((dom[j]! & (1 << need)) !== 0) out.push(j)
      } else if (val[j]! > 0 && partner[j]! < 0 && canPair(val[i]!, val[j]!, dir)) {
        // 已知且未配对的兼容符号也可以作为搭档（只作为必要条件放宽，不会误判）
        out.push(j)
      }
    }
    return out
  })
  const match = new Map<number, number>()
  const seen = new Set<number>()
  const dfs = (si: number): boolean => {
    for (const j of candidates[si]!) {
      if (seen.has(j)) continue
      seen.add(j)
      const prev = match.get(j)
      if (prev === undefined || dfs(prev)) {
        match.set(j, si)
        return true
      }
    }
    return false
  }
  for (let si = 0; si < symbols.length; si++) {
    seen.clear()
    if (!dfs(si)) return false
  }
  return true
}

function propagateOnce(est: EngineState): boolean {
  if (!passLocal(est)) return false
  if (!passPairing(est)) return false
  if (!passEmptyForcing(est)) return false
  if (!passSight(est)) return false
  if (!passLineSight(est)) return false
  if (!passHall(est)) return false
  return true
}

/** 传播到不动点；返回 false 表示矛盾 */
export function propagate(est: EngineState): boolean {
  for (let guard = 0; guard < 20000; guard++) {
    est.changed = false
    if (!propagateOnce(est)) return false
    if (!est.changed) return true
  }
  return false
}

export function isComplete(est: EngineState): boolean {
  const val = est.val
  for (let i = 0; i < val.length; i++) if (val[i]! === -1) return false
  return true
}

/** 是否所有符号格都已有搭档（用于完成前的内部检查） */
export function allPaired(est: EngineState): boolean {
  const { val, partner } = est
  for (let i = 0; i < val.length; i++) {
    if (val[i]! > 0 && partner[i]! < 0) return false
  }
  return true
}

/** 找出一个未知格；没有返回 -1 */
export function firstUnknown(est: EngineState): number {
  const val = est.val
  for (let i = 0; i < val.length; i++) if (val[i]! === -1) return i
  return -1
}

/** 已确定的类型数组（未知按空处理，仅用于最终解） */
export function typesOf(est: EngineState): number[] {
  const out = new Array<number>(est.geo.n)
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, est.val[i]!)
  return out
}

export { makeGeo, T_EMPTY, T_HEAD, T_H, T_V, DIR_H }



