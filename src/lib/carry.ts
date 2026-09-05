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
 *     운영 매체에 **똑같이 나눠** 담는다(끝난 매체에 담아 봐야 태울 수 없다). 전부
 *     끝났으면 어쩔 수 없이 전체에 담는다 — 그래야 돈이 어디로 갔는지는 남는다.
 *   · 넘길 금액은 **수기로 고칠 수 있다**. 전액을 넘기지 않고 일부만 넘기는 경우가
 *     있어서다. 남은 것보다 많이 넘길 수는 없으므로 잔여액에서 자른다.
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
  /** 넘길 수 있는 최대 금액 = 그 시점의 잔여액. 수기 입력의 상한이다 */
  carryCap: number
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
  carryCap: 0,
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
  // 총예산에는 **받은 것만** 더한다. 넘기는 행은 정의상 끝난 차수이고, 끝난 행의
  // setLife 는 natDone(이미 태운 원통화)이라 잔여금이 애초에 들어 있지 않다 —
  // 거기서 넘긴 금액을 빼면 총예산이 음수가 된다(멕시코 Phase0 netflix 에서 확인).
  if (r.setLife !== null && r.setRate) r.setLifeAdj = r.setLife + r.carryIn / r.setRate

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

/**
 * 이관액을 다음 차수에 나눠 담는다 — **운영 매체 수로 균등 분할**.
 *
 * 처음에는 품의예산 비례로 담았지만, 실제로는 남은 돈을 그 차수의 매체들에 똑같이
 * 얹어 태우는 방식이라 균등으로 바꿨다(2026-09-05 지시).
 *
 * 담는 대상은 그 차수에서 **아직 진행 중인 행**이다 — 같은 차수라도 매체마다 종료일이
 * 다를 수 있는데(멕시코 Phase2 는 criteo 만 9/6 까지, 나머지는 7/5), 이미 끝난 매체에
 * 담아 봐야 태울 수 없다. 전부 끝났으면 어쩔 수 없이 전체에 담는다 — 그래야 돈이
 * 어디로 갔는지는 남는다.
 *
 * 원 단위 나머지는 마지막 행에서 맞춘다(합이 넘긴 금액과 정확히 같아야 한다).
 */
function spread(all: CarryRow[], amount: number) {
  const live = all.filter((r) => (r.daysLeft ?? 0) > 0)
  const rows = live.length ? live : all
  const each = Math.round(amount / rows.length)
  let left = amount
  rows.forEach((r, i) => {
    const share = i === rows.length - 1 ? left : each
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
export function applyCarry(
  src: OpsRow[],
  picked: Set<string>,
  /** 넘길 금액을 수기로 고친 행 (id → KRW). 없으면 잔여액 전액을 넘긴다 */
  amounts?: Map<string, number>,
): CarryResult {
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
          r.carryCap = r.leftKrw ?? 0
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
        const avail = Math.max(r.leftAdj ?? 0, 0)
        r.carryCap = avail
        if (avail <= 0) continue
        // 수기로 고친 금액이 있으면 그 값. 남은 것보다 많이 넘길 수는 없으므로 잘라 둔다
        const want = amounts?.get(r.id)
        const v = want === undefined ? avail : Math.max(0, Math.min(want, avail))
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
