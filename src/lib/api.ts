/**
 * lge-billing-dashboard 백엔드의 `/api/adv/*` 페이로드 계약 (backend/adv.py).
 *
 * 쓰는 값은 **잔여금 이관 계획 하나뿐**이다(`saveCarry`). 그 밖은 전부 읽기만 한다.
 * 백엔드가 화이트리스트로 골라 보내므로
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
  /**
   * 내부 정산 대시보드에서 사람이 고친 기록. 금액은 위 billMedia·billFee·taxKrw 에
   * **이미 반영돼 있고**, 여기 오는 건 누가 왜 고쳤는지다. 여럿이 같이 보는 화면이라
   * 근거가 숫자와 같이 가야 한다.
   */
  taxOv: TaxOvRec | null
  /** 이 행이 근거로 든 인보이스 파일들 */
  invoices: InvoiceRef[]
}

/** 인보이스 PDF 한 건 */
export interface InvoiceRef {
  name: string
  path: string
  /** 그 PDF 안에서 이 행에 합산된 개별 라인 금액 — 뷰어가 그 자리에 형광 표시를 넣는다 */
  amts: number[]
}

/**
 * 인보이스 PDF 주소. `a` 를 붙이면 서버가 그 금액이 나오는 자리에 형광 표시를 넣은
 * 사본을 만들어 준다 — 어느 줄이 이 행의 숫자가 됐는지 PDF 안에서 짚을 수 있다.
 */
/**
 * 화면에 남은 라인의 인보이스를 한 덩이로 받는다.
 *
 * 경로를 GET 질의로 붙이면 150건에서 URL 이 6KB 를 넘어 잘린다 → POST 로 보낸다.
 * 서버가 허용 목록을 다시 대조하므로 여기서 보낸 목록이 그대로 신뢰되지는 않는다.
 */
export async function fetchInvoiceZip(paths: string[]): Promise<Blob> {
  const res = await fetch(`${API_BASE}/invoices.zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.blob()
}

export function invoiceUrl(it: InvoiceRef, hl: boolean): string {
  let u = `${API_BASE}/invoice?p=${encodeURIComponent(it.path)}`
  if (hl && it.amts?.length) u += `&a=${encodeURIComponent(it.amts.join(","))}`
  return u
}

/** 세금계산서 수기 수정 한 건 (내부 대시보드에서 저장된 것) */
export interface TaxOvRec {
  /** 비운 항목(null)은 자동 계산값을 쓴 것 */
  media: number | null
  fee: number | null
  /** 구버전 기록 — 발행 총액만 저장돼 있던 값 */
  value: number | null
  by: string
  reason: string
  at: string
  owner: string | null
  history: Array<Omit<TaxOvRec, "history">>
}

export interface SettlePayload {
  rows: SettleRow[]
  months: string[]
  generatedAt: string
}

// ───────────────────────────── 운영

/** 월별 소진값의 출처 — 확정(인보이스) / 수기(입력) / 계획(자동기입) */
export type MonSrc = "확정" | "수기" | "시트" | "계획" | ""

/** 품의예산 한 줄 — 솔루션 × 국가(차수) × 매체 */
export interface OpsRow {
  id: string
  sol: string
  ctry: string
  ctryKor: string
  phase: string
  med: string
  /** Ad Product — 품의예산 시트의 상품 구분. 한 라인에 여럿이면 `/` 로 잇는다 */
  prods: string
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
  /** 월별 청구환율 = 그 달 KRW ÷ 그 달 세팅통화 금액 */
  /** 진척률(%) — 시작일~종료일 중 경과 비율. 각 국가 현지 날짜로 센 값이다 */
  progress: number | null
  monFx: Record<string, number>
  /** 그 달 환율이 인보이스 적용환율이 아니라 행 환산환율인지 */
  monFxEst: Record<string, boolean>

  /** 실소진 = 계획(자동기입)을 뺀 합. 세팅 일예산의 분자를 만드는 값 */
  spentEffKrw: number
  /** 그중 Criteo 실시간 시트로 메운 몫 */
  sheetKrw: number
  /** 실소진의 세팅통화 합 */
  natTotal: number
  /** 인보이스가 있는 달에서 시트/인보이스 비율. 1 에서 크게 벗어나면 시트를 믿기 어렵다 */
  sheetRatio?: number | null
}

/** 잔여금 이관 배분 — `출발 행 id → { 도착 행 id: 잔여액 대비 비율 }` */
export type CarryPlans = Record<string, Record<string, number>>

/**
 * 이관 계획을 저장한다 — 이 앱이 유일하게 쓰는 값.
 *
 * 화면 안에만 두면 새로고침에 사라지고, 같이 보는 사람마다 다른 화면을 본다.
 * `share` 가 비면 그 라인의 이관을 푼다.
 */
export async function saveCarry(
  id: string,
  share: Record<string, number> | null,
): Promise<{ plans: CarryPlans; savedAt: string }> {
  const res = await fetch(`${API_BASE}/carry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, share: share || {} }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || d.ok === false) throw new Error(d.msg || `${res.status}`)
  return d
}

/** 이관을 전부 푼다 */
export async function clearCarry(): Promise<{ plans: CarryPlans; savedAt: string }> {
  const res = await fetch(`${API_BASE}/carry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || d.ok === false) throw new Error(d.msg || `${res.status}`)
  return d
}

export interface OpsPayload {
  rows: OpsRow[]
  today: string
  /** 소진액이 인보이스로 확정된 마지막 달. 이후 달은 계획값이다 */
  closedMonth: string
  mix: { fetchedAt: string; n: number; totalUsd: number }
  /** Criteo 실시간 소진 시트 — 어디까지 담겼는지와, 캠페인명으로 못 붙인 것들 */
  /** 저장된 잔여금 이관 배분 — 같이 보는 사람 모두 같은 값을 본다 */
  carry: { plans: CarryPlans; savedAt: string }
  sheet: {
    asOf: string
    fetchedAt: string
    unmatched: Array<{ camp: string; usd: number }>
    /** 통합 raw 스냅샷이 덮은 매체·달 — 캠페인명 추측 없이 컬럼으로 확정된 값 */
    raw: {
      months: string[]
      /** 스냅샷이 있는 매체 (criteo 외 매체는 이게 유일한 실시간 소스다) */
      meds: string[]
      /** 매일 낮 12시 적재분 — 진행 중인 달을 따라간다 */
      daily: { pulledAt: string; asOf: string; meds: string[] } | null
      /** 매체|달 → 어느 소스를 썼는지 (`미사용` = 그 달 1일부터 못 덮어 뺀 것) */
      picked: Record<string, { src: string; cover: { from: string; to: string; days: number } | null; why?: string }>
      snapshots: Array<{
        file: string
        med: string
        months: string[]
        asOf: string
        capturedAt: string
        rows: number
      }>
    } | null
  }
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
