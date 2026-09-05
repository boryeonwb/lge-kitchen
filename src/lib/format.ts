/** 표시 포맷 — 내부 정산 대시보드와 같은 규칙을 쓴다(숫자가 같아 보여야 대조가 된다). */

type Num = number | null | undefined | ""

const nil = (v: Num) => v === null || v === undefined || v === ""

export const MONLBL = (m?: string | null) => (m ? `${+m.slice(5, 7)}월` : "?")

export const f0 = (v: Num) => (nil(v) ? "" : Math.round(v as number).toLocaleString("ko-KR"))

export const f2 = (v: Num) =>
  nil(v)
    ? ""
    : (v as number).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 억원 단위 (소수 1자리) */
export const eok = (v: number) =>
  (v / 1e8).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * 세금계산서 발행월 필터.
 * `""` 전체 / `"0"` 미발행 / `"1"`~`"12"` N월 — 미발행(null)을 "0" 으로 접어야
 * 드롭다운 하나로 '아직 안 낸 라인만' 을 고를 수 있다.
 */
export const ISSKEY = (m?: number | null) => String(m ?? 0)
export const ISSLBL = (v: string) => (v === "0" ? "미발행" : `${v}월`)
export const issMatch = (sel: string, m?: number | null) => !sel || ISSKEY(m) === sel
export const issValues = (ms: (number | null)[]) =>
  [...new Set(ms.map(ISSKEY))].sort((a, b) => Number(a) - Number(b))

/** 처리주체 — 광고주계정(HSAD)은 매체비를 광고주가 직접 집행하고 WB 는 수수료만 청구한다 */
export const OWNER_LBL: Record<string, string> = { HSAD: "HSAD", WB: "와이즈버즈" }
