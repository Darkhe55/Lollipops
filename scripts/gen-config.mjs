/**
 * 棒棒糖题库生成配置（npm run gen 使用）
 *
 * 生成器是确定性的（固定 seed），所以每次生成结果一致；
 * 生成后会由 scripts/check.mjs 做唯一解 / 逻辑可推 / 参考解合法性深度审计。
 */

import { generatePuzzles as generate } from '../src/game/generator.ts'

export const NAME = '棒棒糖生成器'

export function generatePuzzles() {
  return generate()
}
