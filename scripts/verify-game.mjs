/**
 * 棒棒糖（Lollipops）—— Playwright 端到端验证
 *
 * 前置：先启动 dev server（npm start / npm run dev，端口读 package.json），
 *       再运行 `npm run verify`（可用 EDGE_PATH 指定浏览器）。
 *
 * 覆盖：
 *   1. 页面无脚本错误、内置题 ≥ 6、参考解全部通过校验；
 *   2. 键盘：方向键移动光标、空格循环、1-4 直接落子、Backspace 清除、撤销重做；
 *   3. 鼠标：左键循环、右键清除；
 *   4. 逻辑解题回放能解出内置题；
 *   5. 显示解 / 提示一格 / 检查；
 *   6. 自定义题板：生成网格 → 放置符号 → 载入并保存 → 题库内编辑 → 删除（含磁盘 data/library.json 校验）。
 *
 * 截图输出到 output/playwright/。
 */

import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { PORT } from './_port.mjs'

const executablePath =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SHOT_DIR = 'output/playwright'
fs.mkdirSync(SHOT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })

const errors = []
let failures = 0
const results = []

page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE ' + m.text())
})

function ok(name, condition, detail = '') {
  if (condition) {
    results.push(`✓ ${name}${detail ? ' — ' + detail : ''}`)
    console.log(`✓ ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    failures++
    results.push(`✗ ${name}${detail ? ' — ' + detail : ''}`)
    console.error(`✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 读取项目内 data/library.json（dev server 的 /__store 落盘位置） */
function readLibrary() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve('data/library.json'), 'utf8'))
  } catch {
    return []
  }
}

/** 计算某个格子在页面上的点击坐标（考虑 viewBox 缩放） */
async function cellPoint(index) {
  return page.evaluate((i) => {
    const g = window.__game
    const s = g.getSession()
    const m = g.adapter.metricsFor(s.puzzle)
    const svg = document.querySelector('svg.board-svg')
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    const x = m.pad + (i % s.puzzle.width) * m.cell + m.cell / 2
    const y = m.pad + Math.floor(i / s.puzzle.width) * m.cell + m.cell / 2
    return {
      x: rect.x + (x - vb.x) * (rect.width / vb.width),
      y: rect.y + (y - vb.y) * (rect.height / vb.height),
    }
  }, index)
}

async function sessionInfo() {
  return page.evaluate(() => {
    const g = window.__game
    const s = g.getSession()
    const r = g.adapter.validate(s.state, s.puzzle)
    return {
      id: s.puzzle.id,
      name: s.puzzle.name,
      width: s.puzzle.width,
      height: s.puzzle.height,
      difficulty: s.puzzle.difficulty,
      cells: s.state.cells.slice(),
      givens: s.state.givens.slice(),
      cursor: g.adapter.keyboard ? g.adapter.keyboard.cursor(s.state) : null,
      solved: r.solved,
      status: document.querySelector('#status').textContent,
    }
  })
}

/* ────────────────────────── 1. 启动与题库 ────────────────────────── */

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')
await sleep(300)
await page.screenshot({ path: `${SHOT_DIR}/01-initial.png`, fullPage: true })

ok('页面标题为「棒棒糖」', (await page.title()).includes('棒棒糖'), await page.title())

const puzzleCount = await page.locator('.puzzle-item').count()
ok('内置题至少 6 道', puzzleCount >= 6, `${puzzleCount} 道`)

const referenceReport = await page.evaluate(() => {
  const a = window.__game.adapter
  return a.builtinPuzzles.map((p) => {
    const sol = a.getReferenceSolution(p.id)
    return {
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      hasSolution: !!sol,
      solved: sol ? a.validate(sol, p).solved : false,
    }
  })
})
ok(
  '所有内置题参考解通过校验',
  referenceReport.length === puzzleCount && referenceReport.every((r) => r.hasSolution && r.solved),
  referenceReport.map((r) => r.name).join(' / '),
)

/* ────────────────────────── 2. 键盘交互 ────────────────────────── */

// 选第一题（5×5），先清空以保证与存档状态无关，光标回到 0
await page.locator('.puzzle-item').first().click()
await sleep(150)
await page.click('#btn-clear')
await sleep(150)
const before = await sessionInfo()
ok('第一题已载入', before.name === '初识棒棒糖', before.name)
ok('键盘光标初始为 0', before.cursor === 0, String(before.cursor))
ok('第一格不是预填格', before.givens[0] === 0)

await page.keyboard.press(' ')
await sleep(120)
let info = await sessionInfo()
ok('空格：空格子 → 白圆头', info.cells[0] === 2, `cell0=${info.cells[0]}`)

await page.keyboard.press(' ')
await sleep(120)
info = await sessionInfo()
ok('空格连续循环到横棍', info.cells[0] === 3, `cell0=${info.cells[0]}`)

await page.keyboard.press('Backspace')
await sleep(120)
info = await sessionInfo()
ok('Backspace 清除当前格', info.cells[0] === 0, `cell0=${info.cells[0]}`)

await page.keyboard.press('ArrowRight')
await sleep(100)
info = await sessionInfo()
ok('方向键右移光标', info.cursor === 1, `cursor=${info.cursor}`)
await page.keyboard.press('3')
await sleep(120)
info = await sessionInfo()
ok('数字键 3 直接放竖棍', info.cells[1] === 4, `cell1=${info.cells[1]}`)
await page.keyboard.press('ArrowDown')
await sleep(100)
info = await sessionInfo()
ok('方向键下移光标', info.cursor === 6, `cursor=${info.cursor}`)
await page.keyboard.press('1')
await sleep(120)
info = await sessionInfo()
ok('数字键 1 直接放白圆头', info.cells[6] === 2, `cell6=${info.cells[6]}`)
await page.screenshot({ path: `${SHOT_DIR}/02-keyboard.png`, fullPage: true })

// 撤销 / 重做：撤到历史为空为止
const undoCount = await page.evaluate(() => window.__game.getSession().undo.length)
for (let i = 0; i < undoCount; i++) {
  await page.click('#btn-undo')
  await sleep(40)
}
await sleep(150)
info = await sessionInfo()
ok(
  '连续撤销回到题面',
  info.cells.every((v, i) => v === info.givens[i]),
  `撤销 ${undoCount} 步`,
)
await page.click('#btn-redo')
await sleep(120)
info = await sessionInfo()
ok('重做恢复一步', info.cells[0] === 2, `cell0=${info.cells[0]}`)
await page.click('#btn-clear')
await sleep(120)

/* ────────────────────────── 3. 鼠标交互 ────────────────────────── */

const mouseCell = 12
let pt = await cellPoint(mouseCell)
await page.mouse.click(pt.x, pt.y)
await sleep(120)
info = await sessionInfo()
ok('鼠标左键循环标记', info.cells[mouseCell] === 2, `cell${mouseCell}=${info.cells[mouseCell]}`)
await page.mouse.click(pt.x, pt.y)
await sleep(120)
info = await sessionInfo()
ok('再次点击继续循环', info.cells[mouseCell] === 3, `cell${mouseCell}=${info.cells[mouseCell]}`)
await page.mouse.click(pt.x, pt.y, { button: 'right' })
await sleep(120)
info = await sessionInfo()
ok('鼠标右键清除', info.cells[mouseCell] === 0, `cell${mouseCell}=${info.cells[mouseCell]}`)
await page.screenshot({ path: `${SHOT_DIR}/03-mouse.png`, fullPage: true })

/* ────────────────────────── 4. 逻辑解题 ────────────────────────── */

await page.locator('.puzzle-item', { hasText: '甜蜜视线' }).first().click()
await sleep(150)
await page.click('#btn-clear')
await sleep(150)
const logicStart = Date.now()
await page.click('#btn-logic')
await page.waitForFunction(
  () => {
    const b = document.querySelector('#btn-logic')
    return b && !b.disabled && b.textContent === '逻辑解题'
  },
  { timeout: 120000 },
)
await sleep(400)
info = await sessionInfo()
ok('逻辑解题回放解出内置题', info.solved, `${Date.now() - logicStart}ms · ${info.status}`)
await page.screenshot({ path: `${SHOT_DIR}/04-logic-solved.png`, fullPage: true })

// 显示解
await page.click('#btn-clear')
await sleep(120)
await page.click('#btn-solve')
await sleep(200)
info = await sessionInfo()
ok('显示解通过校验', info.solved, info.status)

// 提示一格
await page.click('#btn-clear')
await sleep(120)
await page.click('#btn-hint')
await sleep(150)
info = await sessionInfo()
const placed = info.cells.filter((v, i) => v !== 0 && v !== info.givens[i]).length
ok('提示一格落下一个符号', placed >= 1, `新增 ${placed} 个`)

// 检查按钮
await page.click('#btn-check')
await sleep(120)
info = await sessionInfo()
ok('未完成时检查给出提示', !info.solved && info.status.length > 0, info.status)

/* ────────────────────────── 5. 自定义题板：生成 / 保存 ────────────────────────── */

const libraryBefore = readLibrary()
await page.click('#btn-custom')
await sleep(150)
await page.fill('#custom-w', '6')
await page.fill('#custom-h', '5')
await page.click('#custom-regen')
await sleep(150)

// 依次放置：白圆头、横棍、白圆头、竖棍
const place = async (index, clicks) => {
  for (let k = 0; k < clicks; k++) {
    await page.locator(`.custom-cell[data-i="${index}"]`).click()
    await sleep(30)
  }
}
await place(0, 1) // 白圆头
await place(1, 2) // 横棍（与 (0,0) 圆头横向配对）
await place(8, 1) // 白圆头
await place(14, 3) // 竖棍（与 (1,2) 圆头纵向配对）
await page.screenshot({ path: `${SHOT_DIR}/05-custom-editor.png`, fullPage: true })

const customCells = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.custom-cell')).map((el) => el.textContent),
)
ok(
  '自定义题板可放置白圆/横棍/竖棍',
  customCells[0] === '○' && customCells[1] === '━' && customCells[8] === '○' && customCells[14] === '┃',
  JSON.stringify([customCells[0], customCells[1], customCells[8], customCells[14]]),
)

await page.click('#custom-apply')
await sleep(400)
info = await sessionInfo()
ok('载入自定义题板', info.difficulty === 'custom' && info.width === 6 && info.height === 5, `${info.width}×${info.height}`)
ok(
  '自定义题板 givens 正确带入',
  info.givens[0] === 2 && info.givens[1] === 3 && info.givens[8] === 2 && info.givens[14] === 4,
  JSON.stringify(info.givens.filter((v) => v !== 0)),
)
const customId = info.id
const customMsg = (await page.locator('#custom-msg').textContent()) ?? ''
ok(
  '自定义题板给出唯一解检查提示',
  /题面|唯一解|多解/.test(customMsg),
  customMsg.trim(),
)
await sleep(700)
const libraryAfterSave = readLibrary()
const savedEntry = libraryAfterSave.find((e) => e.id === customId)
ok('自定义题板保存到题库（data/library.json）', !!savedEntry, customId)
if (savedEntry) {
  ok('题库条目可编码题面', typeof savedEntry.board === 'string' && savedEntry.board.length === 30)
}
await page.screenshot({ path: `${SHOT_DIR}/06-custom-saved.png`, fullPage: true })

/* ────────────────────────── 6. 自定义题板：编辑 ────────────────────────── */

const editBtn = page.locator(`[data-edit="${customId}"]`)
ok('题库出现自定义题的编辑按钮', (await editBtn.count()) === 1)
await editBtn.click()
await sleep(250)
const restored = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.custom-cell')).map((el) => el.textContent),
)
ok(
  '编辑时题面还原到编辑器',
  restored[0] === '○' && restored[1] === '━' && restored[8] === '○' && restored[14] === '┃',
  JSON.stringify([restored[0], restored[1], restored[8], restored[14]]),
)
await place(2, 1) // 追加一个白圆头
await page.click('#custom-save')
await sleep(700)
const libraryAfterEdit = readLibrary()
const editedEntry = libraryAfterEdit.find((e) => e.id === customId)
ok(
  '编辑保存后题库条目更新',
  !!editedEntry && editedEntry.board[2] === '2',
  editedEntry ? editedEntry.board : '(missing)',
)
ok(
  '编辑不会新增重复条目',
  libraryAfterEdit.filter((e) => e.id === customId).length === 1,
  `${libraryAfterEdit.filter((e) => e.id === customId).length} 条`,
)
await page.screenshot({ path: `${SHOT_DIR}/07-custom-edited.png`, fullPage: true })
await page.click('#custom-close')
await sleep(120)

/* ────────────────────────── 7. 自定义题板：删除 ────────────────────────── */

const listBeforeDelete = await page.locator('.puzzle-item').count()
const delBtn = page.locator(`[data-del="${customId}"]`)
ok('题库出现自定义题的删除按钮', (await delBtn.count()) === 1)
await delBtn.click()
await sleep(120)
ok(
  '删除需要二次确认',
  (await page.locator(`[data-del="${customId}"].confirm`).count()) === 1,
)
await page.locator(`[data-del="${customId}"]`).click()
await sleep(700)
const libraryAfterDelete = readLibrary()
ok(
  '删除后题库（data/library.json）不再包含该题',
  !libraryAfterDelete.some((e) => e.id === customId),
  customId,
)
const listAfterDelete = await page.locator('.puzzle-item').count()
ok('删除后侧栏题目减少 1 道', listAfterDelete === listBeforeDelete - 1, `${listBeforeDelete} → ${listAfterDelete}`)
ok('删除其它题未受影响', libraryAfterDelete.length === libraryBefore.length, `${libraryBefore.length} → ${libraryAfterDelete.length}`)
await page.screenshot({ path: `${SHOT_DIR}/08-after-delete.png`, fullPage: true })

/* ────────────────────────── 8. 收尾 ────────────────────────── */

// 回到内置题并确认页面仍可交互
await page.locator('.puzzle-item').first().click()
await sleep(150)
await page.click('#btn-clear')
await sleep(150)
const beforeInteractive = await sessionInfo()
await page.keyboard.press(' ')
await sleep(150)
info = await sessionInfo()
const placedAfter = info.cells.filter((v, i) => v !== beforeInteractive.givens[i]).length
ok('页面在完整流程后仍可交互', placedAfter >= 1, `新增 ${placedAfter} 个符号`)

ok('没有页面脚本错误', errors.length === 0, errors.join(' | '))

console.log('\n===== 验证结果 =====')
for (const line of results) console.log(line)
console.log(`\n失败 ${failures} 项，脚本错误 ${errors.length} 个`)

await browser.close()
if (failures > 0 || errors.length > 0) process.exitCode = 1

