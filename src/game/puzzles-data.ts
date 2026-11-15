/* 自动生成，勿手改。运行 npm run gen 重新生成。 */
export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */
  board: string
  /** 参考解编码串（没有则留空） */
  solution?: string
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "lollipops-5x5-4nclpq", name: "初识棒棒糖", width: 5, height: 5, difficulty: "easy", series: "入门", board: "0020400000400000004003020", solution: "0020420402400000004013020" },
  { id: "lollipops-6x5-9363u6", name: "圆头与棍子", width: 6, height: 5, difficulty: "easy", series: "入门", board: "000200023002000000400000030040", solution: "000230023002200004400010031040" },
  { id: "lollipops-6x6-dizlym", name: "糖果小铺", width: 6, height: 6, difficulty: "easy", series: "入门", board: "400003000000020000400004100000002002", solution: "400023200000023001400104100400032032" },
  { id: "lollipops-7x6-hyt432", name: "甜蜜视线", width: 7, height: 6, difficulty: "medium", series: "进阶", board: "030010000200003000401000000020300040000000", solution: "130013000230043100401000020020320044000001" },
  { id: "lollipops-7x7-memm7i", name: "错落糖果", width: 7, height: 7, difficulty: "medium", series: "进阶", board: "0000200200000000000400400302020000000040004000001", solution: "0003200204001040200400401302020000420040004001031" },
  { id: "lollipops-8x6-qug4by", name: "隔空对望", width: 8, height: 6, difficulty: "medium", series: "进阶", board: "004020014000000010000000000200300400000000004010", solution: "004023014020000410003100003200320400200001004013" },
  { id: "lollipops-8x8-va9mge", name: "棒棒糖森林", width: 8, height: 8, difficulty: "hard", series: "挑战", board: "1000003000030000300003000010400010000040000000000020000400003000", solution: "1300023000031000310003100010400010401040400000100320000400023002" },
  { id: "lollipops-9x7-zq34ku", name: "终局糖果", width: 9, height: 7, difficulty: "hard", series: "挑战", board: "401300200000000000000030402020000000000000000204000000000030002", solution: "401300230200000004000230402023000100400013023204000000001032032" },
]
