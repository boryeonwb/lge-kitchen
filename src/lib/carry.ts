import type { OpsRow } from "#/lib/api"

/**
 * 잔여금 이관 — 끝난 Phase 에 남은 돈을 같은 솔루션·국가의 다음 Phase 로 넘긴다.
 *
 * **계산은 화면에서 하고, 사람이 고른 배분만 서버에 남긴다.** 실제 품의·매체 세팅을
 * 바꾸는 것이 아니라 "이렇게 넘기면 세팅 금액이 얼마가 되는가" 를 보는 계산이다. 다만
 * 어느 라인에 얼마를 넘길지는 어떤 원장에도 없는 **사람의 판단**이라, 화면 안에만 두면
 * 새로고침에 사라지고 같이 보는 사람마다 다른 화면을 보게 된다. 그래서 배분(비율)만
 * 저장하고, 그걸로 매번 다시 계산한다. 선택을 풀면 서버가 준 원래 숫자로 되돌아간다.
 *
 * 넘길 라인은 **사람이 고른다**([이관] 버튼 → 팝업). 끝났다고 다 넘기는 게 아니라,
 * 솔루션·국가·Phase·매체를 보고 넘길 것만 고르는 게 실제 운영 방식이다.
 *
 * 규칙
 *   · 묶는 단위는 **솔루션 × 국가**. Phase 는 그 안에서 **종료일 순**으로 줄을 선다 —
 *     '이전 차수' 는 결국 먼저 끝나는 차수이고, 이름(`Phase1-1`)으로 줄 세우면 규칙이
 *     매체 표기에 끌려다닌다.
 *   · 고른 행의 잔여금은 **바로 다음 차수**로 간다. 그 차수가 여러 매체면 진행 중인
 *     운영 매체에 **똑같이 나눠** 담는다(끝난 매체에 담아 봐야 태울 수 없다). 전부
 *     끝났으면 어쩔 수 없이 전체에 담는다 — 그래야 돈이 어디로 갔는지는 남는다.
 *   · 어디에 얼마를 넣을지는 **[이관] 버튼의 팝업에서 라인별로 지정**한다. 균등이
 *     기본이지만 매체마다 태울 여력이 달라 그대로 쓰기 어려운 경우가 있다.
 *   · 지정한 금액은 **잔여액 대비 비율(%)로 저장**한다. 환율이 갱신되면 소진 KRW 가
 *     달라져 잔여액이 움직이는데, 금액을 원 단위로 굳혀 두면 그때부터 합이 안 맞는다.
 *     비율로 두면 잔여액이 바뀌어도 지정한 배분이 그대로 따라간다.
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
  /** 넘길 수 있는 최대 금액 = 그 시점의 잔여액. 팝업 입력의 상한이다 */
  carryCap: number
  /** 이 라인이 넘길 수 있는 다음 차수 행들의 id (팝업이 이 목록으로 칸을 만든다) */
  dests: string[]
  /** 넘길 때 상대가 될 다음 차수 */
  nextPhase: string
  /** 이관을 반영한 값 */
  leftAdj: number | null
  setLifeAdj: number | null
  setDailyAdj: number | null
  /** 소진율(%) — 실소진 ÷ 품의예산 KRW. 화면에서 채운다 */
  spentRate: number | null
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
  dests: [],
  nextPhase: "",
  leftAdj: r.leftKrw,
  setLifeAdj: r.setLife,
  setDailyAdj: null,
  spentRate: null,
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
 * 이관 배분 계획 — `출발 행 id → { 도착 행 id: 잔여액 대비 비율 }`.
 *
 * 비율로 들고 있는 이유는 환율이다. 잔여액 = 품의KRW − 소진KRW 인데 소진 KRW 는
 * 환율(HSAD 내부환율·SMBS)로 환산한 값이라 환율이 갱신되면 같이 움직인다. 팝업에서
 * 넣은 금액을 원 단위로 굳혀 두면 그 순간부터 배분 합이 잔여액과 어긋난다.
 */
export type CarryPlan = Record<string, Record<string, number>>

/** 기본 배분 — 진행 중인 매체가 있으면 그 매체들에만, 없으면 전체에 균등 */
export function defaultTargets(dest: CarryRow[]): CarryRow[] {
  const live = dest.filter((r) => (r.daysLeft ?? 0) > 0)
  return live.length ? live : dest
}

/** 계획대로 담는다. 원 단위 나머지는 마지막 칸에서 맞춰 합이 넘긴 금액과 같게 둔다. */
function place(dest: CarryRow[], share: Record<string, number>, total: number) {
  const ids = dest.filter((r) => (share[r.id] || 0) > 0)
  const sum = ids.reduce((a, r) => a + share[r.id], 0)
  if (!ids.length || sum <= 0) return
  let left = total
  ids.forEach((r, i) => {
    const v = i === ids.length - 1 ? left : Math.round((total * share[r.id]) / sum)
    r.carryIn += v
    r.leftAdj = (r.leftAdj ?? 0) + v
    left -= v
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
 * @param plans 팝업에서 지정한 배분. 비어 있으면 이관 없이 원래 값이다.
 */
export function applyCarry(src: OpsRow[], plans: CarryPlan): CarryResult {
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
          r.dests = buckets[i + 1].rs.map((d) => d.id)
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
      for (const r of b.rs) {
        if (!r.canCarry) continue
        // 그때그때의 잔여액을 본다 — 앞 차수에서 넘어온 돈이 다시 넘어갈 수 있다
        const avail = Math.max(r.leftAdj ?? 0, 0)
        r.carryCap = avail
        const share = plans[r.id]
        if (!share || avail <= 0) continue
        // 비율 합만큼만 넘긴다. 전액을 넘기지 않는 경우가 있어 100% 로 고정하지 않는다.
        const pct = Math.min(
          Object.values(share).reduce((a, v) => a + Math.max(v, 0), 0),
          1,
        )
        const out = Math.round(avail * pct)
        if (out <= 0) continue
        r.carryOut = out
        r.carryTo = buckets[i + 1].phase
        r.leftAdj = avail - out
        place(buckets[i + 1].rs, share, out)
        for (const d of buckets[i + 1].rs) if (d.carryIn > 0 && !d.carryFrom) d.carryFrom = b.phase
        moves += 1
        total += out
      }
    }
  }

  for (const r of rows) reprice(r)
  return { rows, eligible, moves, total }
}
