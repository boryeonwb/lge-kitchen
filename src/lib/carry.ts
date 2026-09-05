import type { OpsRow } from "#/lib/api"

/**
 * 잔여금 이관 — 끝난 Phase 에 남은 돈을 같은 솔루션·국가의 다음 Phase 로 넘긴다.
 *
 * **화면 안에서만 계산한다.** 이 앱은 읽기 전용이고 서버에 쓰지 않는다. 토글을 끄면
 * 서버가 준 원래 숫자로 되돌아간다 — 실제 품의·세팅을 바꾼 것이 아니라 "이렇게 넘기면
 * 세팅 금액이 얼마가 되는가" 를 보는 계산이다. 그래서 화면에도 그렇게 적어 둔다.
 *
 * 규칙
 *   · 묶는 단위는 **솔루션 × 국가**. Phase 는 그 안에서 기간 순으로 줄을 선다.
 *   · '이전 Phase 가 끝났다' 는 그 Phase 의 모든 행이 종료(잔여일 0)라는 뜻이다.
 *     기간을 모르는 행(잔여일 null)이 섞이면 끝난 것으로 보지 않는다 — 안전한 쪽으로.
 *   · 끝난 Phase 의 잔여금은 **다음 한 칸**으로 간다. 그 Phase 도 끝났으면 다시 그
 *     다음으로 누적해 흘러가고, 아직 안 끝난 Phase 를 만나면 거기서 멈춘다.
 *   · 마지막 Phase 가 끝나고 남은 돈은 갈 곳이 없다 — 이관하지 않는다(그대로 남는다).
 *   · Phase 가 공란인 행은 어느 차수인지 알 수 없으므로 체인에서 빼고 원래대로 둔다.
 *
 * 한 Phase 에 매체가 여럿이면 **품의예산 비례**로 나눈다. 이관은 차수 단위로 정해지는데
 * 세팅은 매체별로 하므로, 어딘가로는 나눠 담아야 한다.
 */

export interface CarryRow extends OpsRow {
  /** 이전 Phase 에서 넘겨받은 KRW */
  carryIn: number
  /** 다음 Phase 로 넘긴 KRW */
  carryOut: number
  /** 표시용 상대 Phase 라벨 */
  carryFrom: string
  carryTo: string
  /** 이관을 반영한 값. 이관이 없는 행은 서버가 준 값을 그대로 쓴다 */
  leftAdj: number | null
  setLifeAdj: number | null
  setDailyAdj: number | null
}

/** 이관이 실제로 걸린 행인지 (나갔거나 들어왔거나) */
export const moved = (r: CarryRow) => r.carryIn > 0 || r.carryOut > 0

/**
 * 이관으로 **세팅 금액이 실제로 늘어난** 행인지.
 *
 * 이미 끝난 차수로 돈이 들어와도 세팅 금액은 그대로다 — 태울 날이 없기 때문이다.
 * 그런 행까지 강조하면 안 바뀐 숫자에 표시가 붙어 오히려 잘못 읽힌다.
 */
export const boosted = (r: CarryRow) => r.carryIn > 0 && (r.daysLeft ?? 0) > 0

const plain = (r: OpsRow): CarryRow => ({
  ...r,
  carryIn: 0,
  carryOut: 0,
  carryFrom: "",
  carryTo: "",
  leftAdj: r.leftKrw,
  setLifeAdj: r.setLife,
  setDailyAdj: r.setDaily,
})

/**
 * 이관을 반영해 세팅 금액을 다시 만든다.
 *
 * 서버(ops.py)와 같은 식을 쓴다 — **끝난 차수에는 잔여금을 세팅 금액에 넣지 않는다.**
 * 태울 날이 없는데 총예산만 늘리면 매체에 넣을 수 없는 숫자가 나오고, 서버가 준
 * `setLife`(종료 행에서는 natDone 과 같다)와도 어긋난다. 그래서 종료 행은 잔여액과
 * 이관 표시만 바뀌고 세팅 금액은 그대로다.
 */
function reprice(r: CarryRow) {
  if (!r.setRate) {
    r.setLifeAdj = null
    r.setDailyAdj = null
    return
  }
  const days = r.daysLeft ?? 0
  const total = days > 0 ? (r.leftAdj ?? 0) / r.setRate : 0
  r.setLifeAdj = (r.natDone || 0) + total
  r.setDailyAdj = days > 0 ? total / days : null
}

/**
 * 이관액을 나눠 담는다 — 품의예산 비례, 합이 0 이면 균등. 잔차는 마지막 행에서 맞춘다.
 *
 * 받는 차수 안에 **아직 진행 중인 행이 있으면 그 행들에만** 담는다. 같은 차수라도
 * 매체마다 종료일이 다를 수 있는데(멕시코 Phase2 는 criteo 만 9/6 까지, 나머지는 7/5),
 * 이미 끝난 매체에 돈을 담아 봐야 태울 수 없다. 전부 끝난 차수라면 어쩔 수 없이
 * 전체에 담는다 — 그래야 돈이 어디로 갔는지는 남는다.
 */
function spread(all: CarryRow[], amount: number) {
  const live = all.filter((r) => (r.daysLeft ?? 0) > 0)
  const rows = live.length ? live : all
  const w = rows.map((r) => r.budgetKrw || r.budgetUsd || 0)
  const tot = w.reduce((a, v) => a + v, 0)
  let left = amount
  rows.forEach((r, i) => {
    const share =
      i === rows.length - 1
        ? left
        : Math.round(tot > 0 ? (amount * w[i]) / tot : amount / rows.length)
    r.carryIn = share
    r.leftAdj = (r.leftKrw ?? 0) + share
    left -= share
  })
}

export interface CarryResult {
  rows: CarryRow[]
  /** 이관이 일어난 건수와 총액 — 툴바 요약용 */
  moves: number
  total: number
}

export function applyCarry(src: OpsRow[], on: boolean): CarryResult {
  const rows = src.map(plain)
  if (!on) return { rows, moves: 0, total: 0 }

  // 솔루션 × 국가 → Phase → 행
  const groups = new Map<string, Map<string, CarryRow[]>>()
  for (const r of rows) {
    if (!r.phase) continue // 차수를 모르는 행은 체인에서 뺀다
    const gk = `${r.sol}|${r.ctry}`
    let g = groups.get(gk)
    if (!g) groups.set(gk, (g = new Map()))
    const b = g.get(r.phase)
    if (b) b.push(r)
    else g.set(r.phase, [r])
  }

  let moves = 0
  let total = 0

  for (const g of groups.values()) {
    if (g.size < 2) continue // 넘길 곳이 없다

    // Phase 순서는 종료일로 잡는다 — 'Phase1-1' 같은 표기까지 이름으로 줄 세우려 들면
    // 규칙이 매체 표기에 끌려다닌다. '이전 차수' 는 결국 먼저 끝나는 차수다.
    const buckets = [...g.entries()]
      .map(([phase, rs]) => ({
        phase,
        rs,
        end: rs.reduce((a, r) => (r.end > a ? r.end : a), ""),
      }))
      .sort((a, b) => a.end.localeCompare(b.end) || a.phase.localeCompare(b.phase))

    let carry = 0
    let from = ""
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]

      if (carry > 0) {
        spread(b.rs, carry)
        for (const r of b.rs) r.carryFrom = from
        moves += 1
        total += carry
        carry = 0
      }

      const ended = b.rs.every((r) => r.daysLeft === 0)
      if (!ended) break // 진행 중인 차수에서 멈춘다 — 그 뒤로는 넘길 근거가 없다
      if (i === buckets.length - 1) break // 마지막 차수의 잔여금은 갈 곳이 없다

      // 끝났고 남아 있으면 다음 칸으로 넘긴다 (초과집행인 음수는 넘기지 않는다)
      const out = b.rs.reduce((a, r) => a + Math.max(r.leftAdj ?? 0, 0), 0)
      if (out <= 0) break
      for (const r of b.rs) {
        const v = Math.max(r.leftAdj ?? 0, 0)
        r.carryOut = v
        r.carryTo = buckets[i + 1].phase
        r.leftAdj = (r.leftAdj ?? 0) - v
      }
      carry = out
      from = b.phase
    }
  }

  for (const r of rows) if (moved(r)) reprice(r)
  return { rows, moves, total }
}
