/**
 * 棒棒糖（Lollipops）—— 入口
 * 模板只要求保持这个文件把 adapter 接进来；样式分两层：
 *   core/styles.css 提供通用布局/按钮，game/lollipops.css 提供糖果棋盘外观。
 */

import './core/styles.css'
import './game/lollipops.css'
import { createApp } from './core/app'
import { adapter } from './game/adapter'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('no #app')

createApp(root, adapter)
