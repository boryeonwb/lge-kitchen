import type { OpsRow } from "#/lib/api"

/**
 * 잔여금 이관 — 끝난 Phase 에 남은 돈을 같은 솔루션·국가의 다음 Phase 로 넘긴다.
 *
 * **화면 안에서만 계산한다.** 이 앱은 읽기 전용이고 서버에 쓰지 않는다. 선택을 풀면
 * 서버가 준 원래 숫자로 되돌아간다 — 실제 품의·세팅을 바꾼 것이 아니라 "이렇게 넘기면
 * 세팅 금액이 얼마가 되는가" 를 보는 계산이다.
 *
 * 넘길 라인은 **사람이 고른다**(체크박스). 끝났다고 다 넘기는 게 아니라, 솔루션·국가·
 * Phase·매체를 보고 넘길 것만 고르는 게 실제 운영 방식이다.
 *
 * 규칙
 *   · 묶는 단위는 **솔루션 × 국가**. Phase 는 그 안에서 **종료일 순**으로 줄을 선다 —
 *     '이전 차수' 는 결국 먼저 끝나는 차수이고, 이름(`Phase1-1`)으로 줄 세우면 규칙이
 *     매체 표기에 끌려다닌다.
 *   · 고른 행의 잔여금은 **바로 다음 차수**로 간다. 그 차수가 여러 매체면 진행 중인
 *     행에만 품의예산 비례로 담는다(끝난 매체에 담아 봐야 태울 수 없다). 전부 끝났으면
 *     어쩔 수 없이 전체에 담는다 — 그래야 돈이 어디로 갔는지는 남는다.
 *   · 다음 차수가 없으면(마지막 차수) 넘길 곳이 없으므로 고를 수 없다.
 *   · Phase 가 공란인 행은 어느 차수인지 알 수 없어 체인에서 뺀다.
 */

export interface CarryRow extends OpsRow {
  /** 이전 Phase 에서 넘겨받은 KRW */
  carryIn: number
  /** 다음 Phase 로 넘긴 KRW */
  carryOut: number
  /** 표시용 상대 Phase 라벨 */
  carryFrom: string
  carryTo: string
  /** 이 행을 골라 넘길 수 있는지 (끝났고, 남았고, 다음 차수가 있다) */
  canCarry: boolean
  /** 넘길 때 상대가 될 다음 차수 */
  nextPhase: string
  /** 이관을 반영한 값 */
  leftAdj: number | null
  setLifeAdj: number | null
  setDailyAdj: number | null
}

/** 이관이 실제로 걸린 행인지 */
export const moved = (r: CarryRow) => r.carryIn > 0 || r.carryOut > 0

const base = (r: OpsRow): CarryRow => ({
  ...r,
  carryIn: 0,
  carryOut: 0,
  carryFrom: "",
  carryTo: "",
  canCarry: false,
  nextPhase: "",
  leftAdj: r.leftKrw,
  setLifeAdj: r.setLife,
  setDailyAdj: null,
})

/**
 * 세팅 금액을 다시 만든다.
 *
 * **세팅 총예산** — 서버 값에 이관분만 얹는다. 서버 식을 통째로 다시 세우지 않는 이유는
 * 이관이 없는 행까지 값이 미세하게 달라지면 내부 화면과 대조가 안 되기 때문이다.
 *
 * **세팅 일예산 — Criteo 에만 낸다.** `(품의예산 KRW − 실소진 KRW) ÷ 환율 ÷ 잔여일`.
 * 실소진은 인보이스 확정분 + 수기 + (둘 다 없는 달은) Criteo 실시간 시트다. 다른 매체는
 * 실시간 소진을 끌어올 데가 없어 일예산을 내지 않는다 — 계획값으로 만든 일예산은 실적
 * 기반이 아니라서 그대로 매체에 넣으면 안 된다.
 */
function reprice(r: CarryRow) {
  const delta = r.carryIn - r.carryOut
  if (r.setLife !== null && r.setRate) r.setLifeAdj = r.setLife + delta / r.setRate

  if (r.med !== "criteo" || !r.setRate || !r.daysLeft || r.daysLeft <= 0) {
    r.setDailyAdj = null
    return
  }
  if (r.budgetKrw === null) {
    r.setDailyAdj = null // 품의환율 미입력 — KRW 상한 자체가 없다
    return
  }
  const avail = r.budgetKrw - r.spentEffKrw + delta
  r.setDailyAdj = avail > 0 ? avail / r.setRate / r.daysLeft : 0
}

/** 이관액을 나눠 담는다 — 진행 중인 행 우선, 품의예산 비례. 잔차는 마지막 행에서 맞춘다 */
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
    r.carryIn += share
    r.leftAdj = (r.leftAdj ?? 0) + share
    left -= share
  })
}

/** 솔루션 × 국가 → 종료일 순으로 줄 세운 Phase 묶음 */
function phaseChain(rows: CarryRow[]) {
  const groups = new Map<string, Map<string, CarryRow[]>>()
  for (const r of rows) {
    if (!r.phase) continue
    const gk = `${r.sol}|${r.ctry}`
    let g = groups.get(gk)
    if (!g) groups.set(gk, (g = new Map()))
    const b = g.get(r.phase)
    if (b) b.push(r)
    else g.set(r.phase, [r])
  }
  return [...groups.values()].map((g) =>
    [...g.entries()]
      .map(([phase, rs]) => ({ phase, rs, end: rs.reduce((a, r) => (r.end > a ? r.end : a), "") }))
      .sort((a, b) => a.end.localeCompare(b.end) || a.phase.localeCompare(b.phase)),
  )
}

export interface CarryResult {
  rows: CarryRow[]
  /** 고를 수 있는 행 수 · 실제로 넘긴 건수와 총액 */
  eligible: number
  moves: number
  total: number
}

/**
 * @param picked 넘기기로 고른 행의 id. 비어 있으면 이관 없이 원래 값이다.
 */
export function applyCarry(src: OpsRow[], picked: Set<string>): CarryResult {
  const rows = src.map(base)
  const chains = phaseChain(rows)

  // ① 어느 행을 고를 수 있는지 먼저 표시한다 — 체크박스를 그리려면 선택 여부와
  //    무관하게 알아야 한다.
  for (const buckets of chains) {
    for (let i = 0; i < buckets.length - 1; i++) {
      const b = buckets[i]
      if (!b.rs.every((r) => r.daysLeft === 0)) continue // 아직 안 끝난 차수는 못 넘긴다
      for (const r of b.rs) {
        if ((r.leftKrw ?? 0) > 0) {
          r.canCarry = true
          r.nextPhase = buckets[i + 1].phase
        }
      }
    }
  }

  // ② 고른 행만 넘긴다. 앞 차수에서 넘어온 돈이 다시 넘어갈 수 있으므로(가운데 차수)
  //    묶음 순서대로 훑으며 그때그때의 잔여액을 본다.
  let eligible = 0
  let moves = 0
  let total = 0
  for (const r of rows) if (r.canCarry) eligible += 1

  for (const buckets of chains) {
    for (let i = 0; i < buckets.length - 1; i++) {
      const b = buckets[i]
      const take = b.rs.filter((r) => r.canCarry && picked.has(r.id))
      if (!take.length) continue
      let out = 0
      for (const r of take) {
        const v = Math.max(r.leftAdj ?? 0, 0)
        if (v <= 0) continue
        r.carryOut = v
        r.carryTo = buckets[i + 1].phase
        r.leftAdj = (r.leftAdj ?? 0) - v
        out += v
      }
      if (out <= 0) continue
      spread(buckets[i + 1].rs, out)
      for (const r of buckets[i + 1].rs) if (r.carryIn > 0) r.carryFrom = b.phase
      moves += 1
      total += out
    }
  }

  for (const r of rows) reprice(r)
  return { rows, eligible, moves, total }
}
