/**
 * 棒棒糖（Lollipops）—— 从题图自动导入题库
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--name 名称] [--id ID] [--series 系列]
 *                                 [--append] [--verify] [--dry]
 *                                 [--map 簇号=符号编号,...] [--budget 节点数]
 *
 * 符号编号：1=黑圆头 2=白圆头 3=横棍 4=竖棍（与 src/game/types.ts 一致）
 *
 * 流程：
 *   1. Playwright + Edge 打开图片到 canvas，取像素；
 *   2. 用深色像素投影找出网格线，得到棋盘行列数；
 *   3. 每格取中心区域深色墨迹，按「墨迹形状」区分 空 / 圆头 / 横棍 / 竖棍，
 *      并用簇聚类 + --map 支持人工修正；
 *   4. 生成 board 字符串；--verify 时交给 src/game/solver.ts 求解并数唯一解
 *      （超大棋盘默认只求一个解，超时只警告）；
 *   5. 预览；--append 追加到 src/game/puzzles-data.ts。
 *
 * 说明：题图里的米色底、蓝色小点等属于截图 UI 痕迹，会被当作背景忽略。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { countTypeSolutions, findTypeSolution } from '../src/game/solver.ts'
import { encodeBoard, typesFromGivens, valuesFromTypes } from '../src/game/types.ts'

const SYMBOL_NAMES = { 0: '空', 1: '黑圆头', 2: '白圆头', 3: '横棍', 4: '竖棍' }
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function findEdge() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p
  throw new Error('找不到 Microsoft Edge，可用环境变量 EDGE_PATH 指定 msedge.exe 路径')
}

function usage(msg) {
  console.error(`[棒棒糖识图] ${msg}`)
  console.error('用法：node scripts/import-image.mjs <图片路径> [--name 名称] [--id ID] [--series 系列] [--append] [--verify] [--dry] [--map 簇号=符号] [--budget 节点数]')
  process.exit(1)
}

function parseArgs(argv) {
  const out = { file: null, name: null, id: null, series: '识图', append: false, verify: false, dry: false, maps: {}, budget: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) usage(`参数 ${a} 缺少值`)
      return v
    }
    if (a === '--name') out.name = next()
    else if (a === '--id') out.id = next()
    else if (a === '--series') out.series = next()
    else if (a === '--append') out.append = true
    else if (a === '--verify') out.verify = true
    else if (a === '--dry') out.dry = true
    else if (a === '--budget') out.budget = Math.max(1000, Number(next()) || 0)
    else if (a === '--map') {
      for (const token of next().split(',')) {
        const m = /^(\d+)=(\d)$/.exec(token.trim())
        if (!m) usage(`--map 格式应为 簇号=符号编号，收到「${token}」`)
        out.maps[Number(m[1])] = Number(m[2])
      }
    } else if (!a.startsWith('--')) {
      if (out.file) usage(`多余参数 ${a}`)
      out.file = a
    } else usage(`未知参数 ${a}`)
  }
  if (!out.file) usage('请指定图片路径')
  return out
}

const args = parseArgs(process.argv.slice(2))
const imagePath = path.resolve(args.file)
if (!existsSync(imagePath)) usage(`找不到图片：${imagePath}`)

const dataUrl = `data:image/png;base64,${readFileSync(imagePath).toString('base64')}`
const browser = await chromium.launch({ headless: true, executablePath: findEdge() })
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

const detected = await page.evaluate(async ({ dataUrl }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const W = img.naturalWidth
  const H = img.naturalHeight
  const cv = document.getElementById('c')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, W, H).data
  const dark = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    const i = (y * W + x) * 4
    return d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110
  }
  const colCount = new Int32Array(W)
  const rowCount = new Int32Array(H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) { colCount[x]++; rowCount[y]++ }
  const peaks = (counts, min) => {
    const out = []
    let st = -1
    for (let i = 0; i <= counts.length; i++) {
      const on = i < counts.length && counts[i] >= min
      if (on && st < 0) st = i
      if (!on && st >= 0) { out.push((st + i - 1) / 2); st = -1 }
    }
    return out
  }
  const xs = peaks(colCount, H * 0.55)
  const ys = peaks(rowCount, W * 0.55)
  const w = xs.length - 1
  const h = ys.length - 1
  if (w < 3 || h < 3) throw new Error(`网格线识别失败：竖线 ${xs.length} 条、横线 ${ys.length} 条`)
  const x0 = xs[0]
  const y0 = ys[0]
  const cellW = (xs[w] - x0) / w
  const cellH = (ys[h] - y0) / h
  const N = 24
  const cells = []
  for (let ry = 0; ry < h; ry++) {
    const row = []
    for (let cxi = 0; cxi < w; cxi++) {
      const cx = x0 + (cxi + 0.5) * cellW
      const cy = y0 + (ry + 0.5) * cellH
      // 中心区域（±0.34 格）的深色墨迹
      const m = new Array(N * N).fill(0)
      let ink = 0
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const sx = Math.round(cx + (i / (N - 1) - 0.5) * cellW * 0.68)
        const sy = Math.round(cy + (j / (N - 1) - 0.5) * cellH * 0.68)
        if (dark(sx, sy)) { m[j * N + i] = 1; ink++ }
      }
      let minX = N, maxX = -1, minY = N, maxY = -1
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (m[j * N + i]) {
        if (i < minX) minX = i
        if (i > maxX) maxX = i
        if (j < minY) minY = j
        if (j > maxY) maxY = j
      }
      let fillDark = 0
      if (maxX >= 0) {
        for (let j = Math.floor(N * 0.3); j < Math.ceil(N * 0.7); j++) for (let i = Math.floor(N * 0.3); i < Math.ceil(N * 0.7); i++) fillDark += m[j * N + i]
      }
      row.push({ ink, m, minX, maxX, minY, maxY, fillDark })
    }
    cells.push(row)
  }
  return { W, H, w, h, x0, y0, cellW, cellH, cells }
}, { dataUrl })
await browser.close()

const { w, h, cells } = detected
console.log(`[棒棒糖识图] ${path.basename(imagePath)}：棋盘 ${w}×${h}，格子 ${detected.cellW.toFixed(1)}×${detected.cellH.toFixed(1)}px`)

/* ───────── 每格形状特征 → 符号候选 ───────── */
function shapeOf(cell) {
  if (cell.ink < 20) return { empty: true }
  const bw = cell.maxX - cell.minX + 1
  const bh = cell.maxY - cell.minY + 1
  const fill = cell.fillDark / 256 // 中心 40% 区域的深色占比
  const aspect = bw / Math.max(1, bh)
  // 细长条 → 横棍 / 竖棍
  if (aspect >= 2.2) return { kind: 3, aspect, fill }
  if (aspect <= 0.45) return { kind: 4, aspect, fill }
  // 近似圆/方 → 圆头；再按内部有无线条/填充区分黑/白
  return { kind: fill >= 0.45 ? 1 : 2, aspect, fill }
}

const clusters = []
const assign = []
const sim = (a, b) => {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++
    if (a[i] || b[i]) union++
  }
  return union ? inter / union : 0
}
for (let ry = 0; ry < h; ry++) {
  const row = []
  for (let cxi = 0; cxi < w; cxi++) {
    const cell = cells[ry][cxi]
    const shape = shapeOf(cell)
    if (shape.empty) { row.push(-1); continue }
    // 簇的键：符号类型 + 归一化形状（同类再按 IoU 细分）
    let best = -1
    let bestScore = 0
    for (let k = 0; k < clusters.length; k++) {
      if (clusters[k].kind !== shape.kind) continue
      const s = sim(cell.m, clusters[k].proto)
      if (s > bestScore) { bestScore = s; best = k }
    }
    if (best >= 0 && bestScore >= 0.75) {
      clusters[best].count++
      row.push(best)
    } else {
      clusters.push({ proto: cell.m, kind: shape.kind, count: 1 })
      row.push(clusters.length - 1)
    }
  }
  assign.push(row)
}

const mapping = clusters.map((c, k) => {
  const manual = args.maps[k]
  const code = manual ?? c.kind
  if (manual !== undefined) console.log(`[棒棒糖识图] 簇${k} → ${SYMBOL_NAMES[code] ?? code}（人工，n=${c.count}）`)
  else console.log(`[棒棒糖识图] 簇${k} → ${SYMBOL_NAMES[code] ?? code}（自动，n=${c.count}）`)
  return code
})

const givens = new Array(w * h).fill(0)
for (let ry = 0; ry < h; ry++) for (let cxi = 0; cxi < w; cxi++) {
  const c = assign[ry][cxi]
  if (c >= 0) givens[ry * w + cxi] = mapping[c]
}
const board = encodeBoard(givens)
if (process.env.IMPORT_DEBUG) writeFileSync(path.resolve('scripts/.import-debug.json'), JSON.stringify({ w, h, givens }))
const givenCount = givens.filter((v) => v !== 0).length
console.log(`[棒棒糖识图] 线索 ${givenCount} 个，board = ${board.slice(0, 96)}${board.length > 96 ? '…' : ''}`)
console.log('[棒棒糖识图] 盘面（. 空，● 黑圆头，○ 白圆头，─ 横棍，│ 竖棍）：')
const glyph = { 0: '.', 1: '●', 2: '○', 3: '─', 4: '│' }
for (let ry = 0; ry < h; ry++) {
  console.log('  ' + givens.slice(ry * w, ry * w + w).map((v) => glyph[v]).join(' '))
}

if (args.dry) {
  console.log('[棒棒糖识图] --dry：仅识别，不求解、不写入。')
  process.exit(0)
}

/* ───────── 求解（可选唯一性） ───────── */
const initial = typesFromGivens(givens)
const area = w * h
const budget = args.budget || (area > 900 ? 2_000_000 : 400_000)
let solutionText = ''
if (args.verify || area <= 900) {
  console.log(`[棒棒糖识图] 求解中（节点上限 ${budget.toLocaleString()}）…`)
  const t0 = Date.now()
  const types = findTypeSolution(w, h, initial, budget)
  if (types) {
    solutionText = encodeBoard(valuesFromTypes(types, givens))
    console.log(`[棒棒糖识图] 找到解（${Date.now() - t0}ms）`)
    if (args.verify) {
      const counted = countTypeSolutions(w, h, initial, 2, budget)
      if (counted.timedOut) console.warn('[棒棒糖识图] 警告：唯一性检查超时，未能确认解唯一')
      else if (counted.solutions.length > 1) console.warn(`[棒棒糖识图] 警告：解不唯一（至少 ${counted.solutions.length} 个）`)
      else console.log('[棒棒糖识图] 唯一解 ✓')
    }
  } else {
    console.warn(`[棒棒糖识图] 警告：${Date.now() - t0}ms 内没有求出解（大棋盘可能只是搜索超时），仍可导入，参考解留空`)
  }
} else {
  console.log(`[棒棒糖识图] ${w}×${h} 盘面较大，默认跳过求解（加 --verify 强制求解）；参考解留空。`)
}

if (!args.append) {
  console.log('[棒棒糖识图] 预览模式，未写入题库。加 --append 写入 src/game/puzzles-data.ts。')
  process.exit(0)
}

/* ───────── 写入题库 ───────── */
const id = args.id || `lollipops-import-${Date.now().toString(36)}`
const name = args.name || `识图 · ${w}×${h}`
const sol = solutionText ? `, solution: ${JSON.stringify(solutionText)}` : ''
const entry = `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${w}, height: ${h}, difficulty: 'hard', series: ${JSON.stringify(args.series)}, board: ${JSON.stringify(board)}${sol} },\n`
const dataFile = path.resolve('src/game/puzzles-data.ts')
if (!existsSync(dataFile)) usage(`找不到题库文件：${dataFile}`)
let text = readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n')
const marker = text.lastIndexOf('\n]')
if (marker < 0) usage('puzzles-data.ts 格式异常：找不到结尾 ]')
text = text.slice(0, marker + 1) + '\n' + entry + text.slice(marker + 1)
writeFileSync(dataFile, text)
console.log(`[棒棒糖识图] 已写入 ${dataFile}`)
console.log(`[棒棒糖识图] id=${id}  name=${name}`)
console.log('[棒棒糖识图] 注意：npm run gen 会重新生成该文件并覆盖导入内容。')
