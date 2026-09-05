/**
 * lge-billing-dashboard 백엔드의 `/api/adv/*` 페이로드 계약 (backend/adv.py).
 *
 * 읽기 전용이다 — 이 앱에는 쓰기 경로가 없다. 백엔드가 화이트리스트로 골라 보내므로
 * 여기 없는 열(청구율·내부 최종금액·차액·수익/손실·계정ID·비고·메모 등)은 애초에
 * 브라우저까지 오지 않는다.
 */

const API_BASE = "/api/adv"

// ───────────────────────────── 정산

/** 정산 집계행 — 키친만. 월·솔루션·Phase·매체·국가 단위 */
export interface SettleRow {
  id: string
  mon: string
  sol: string
  /** 캠페인명의 Phase 구분. 구분값이 없으면 공란 */
  phase: string
  med: string
  ctry: string
  ctryKor: string
  solOrd: number
  medOrd: number
  phaseOrd: number

  // ① 인보이스
  cur: string
  /** 그 인보이스(계정)의 발행 총액 — 집계행마다 되풀이되는 값이라 합계를 내지 않는다 */
  invTotal: number
  dst: number | null
  invalid: number | null
  /** 광고비net = 집행 + DST안분 + 무효반영 (인보이스 통화) */
  billed: number

  // ② 세금계산서 발행
  /** 세금계산서 환산 환율 — Criteo 는 HSAD 내부환율, 그 외는 적용환율과 같다 */
  taxFx: number | null
  billMedia: number | null
  billFee: number | null
  /** 최종 발행 금액 — 처리주체 HSAD 는 수수료만, WB 는 매체비 + 수수료 */
  taxKrw: number | null
  /** 세금계산서 발행월 1~12 (미발행이면 null) */
  issuedMonth: number | null
  /** WB(자사계정) | HSAD(광고주계정) */
  owner: string
}

export interface SettlePayload {
  rows: SettleRow[]
  months: string[]
  generatedAt: string
}

// ───────────────────────────── 운영

/** 월별 소진값의 출처 — 확정(인보이스) / 수기(입력) / 계획(자동기입) */
export type MonSrc = "확정" | "수기" | "계획" | ""

/** 품의예산 한 줄 — 솔루션 × 국가(차수) × 매체 */
export interface OpsRow {
  id: string
  sol: string
  ctry: string
  ctryKor: string
  phase: string
  med: string
  /** 각 국가 현지 날짜 */
  start: string
  end: string
  daysLeft: number | null
  /** 품의 초과집행 (잔여 < 0) */
  over: boolean

  budgetUsd: number
  budgetKrw: number | null
  /** 품의환율 (미입력이면 null → KRW 계산 보류) */
  budgetFx: number | null

  /** 매체 캠페인의 총예산 칸에 넣을 값 — 이미 정해진 + 앞으로 태울 (세팅 통화) */
  setLife: number | null
  /** 오늘 매체에 넣을 일예산 = 잔여액 ÷ 환율 ÷ 잔여일 (세팅 통화) */
  setDaily: number | null
  setCur: string
  /** 아직 어느 달에도 배분되지 않은 돈 = 품의 − 확정 − 수기 */
  leftKrw: number | null
  /** 세팅 통화 환산 환율 (광고주계정은 HSAD 내부환율, 그 외는 SMBS 기간평균) */
  setRate: number | null
  /** 이미 정해진 원통화 (확정 + 수기) — 세팅 총예산의 앞부분 */
  natDone: number

  /** 월(1~12) → 그 달에 실제로 쓰는 KRW · 그 출처 · 같은 출처의 세팅통화 금액 */
  monKrw: Record<string, number>
  monSrc: Record<string, MonSrc>
  monNat: Record<string, number>
}

export interface OpsPayload {
  rows: OpsRow[]
  today: string
  /** 소진액이 인보이스로 확정된 마지막 달. 이후 달은 계획값이다 */
  closedMonth: string
  mix: { fetchedAt: string; n: number; totalUsd: number }
  stats: {
    rows: number | null
    budgetUsd: number | null
    budgetKrw: number | null
    spentKrw: number | null
    leftKrw: number | null
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  const p = await res.json()
  if (p && p.error) throw new Error(String(p.error).split("\n").slice(-2).join(" "))
  if (!res.ok) throw new Error(`서버 오류 (${res.status})`)
  return p as T
}

export const fetchSettlement = () => get<SettlePayload>("/settlement")
export const fetchOps = () => get<OpsPayload>("/ops")
