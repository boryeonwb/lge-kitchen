import type { SettleRow } from "#/lib/api"

/**
 * 세금계산서 매체비·수수료 수기 수정 — **이 대시보드 안에서만** 반영된다.
 *
 * 서버에 쓰지 않는다(지시). 내부 정산 대시보드의 숫자는 그대로 있고, 여기서 고친 값은
 * 이 브라우저에만 남는다. 그래서 저장소는 localStorage 다 — 탭을 닫아도 남지만 다른
 * 사람 화면에는 가지 않는다. 화면에도 그렇게 적어 둔다: 잘못 알면 "내부에도 반영됐겠지"
 * 하고 넘어가게 된다.
 *
 * 고칠 때마다 **담당자·사유·처리방안**을 받는다. 처리방안은 자유 기재다 — WB 손실로
 * 털지, 다음 달에 조정할지 같은 결정을 나중에 되짚기 위한 기록이라 미리 목록을 정해
 * 가두지 않는다.
 */

const KEY = "lge_adv_tax_ov"
const EDITOR_KEY = "lge_adv_editor"

export interface TaxOvEntry {
  /** 비우면(null) 자동 계산값을 쓴다 */
  media: number | null
  fee: number | null
  by: string
  reason: string
  /** 처리방안 — 자유 기재 */
  plan: string
  at: string
}

export interface TaxOv extends TaxOvEntry {
  /** 이전 수정들 (최신이 앞) */
  history: TaxOvEntry[]
}

export type TaxOvStore = Record<string, TaxOv>

/** localStorage 는 사파리 프라이빗 모드 등에서 던진다 — 실패해도 화면은 떠야 한다 */
export function loadStore(): TaxOvStore {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as TaxOvStore
  } catch {
    return {}
  }
}

function persist(s: TaxOvStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    alert("이 브라우저에 저장하지 못했습니다. 수정 내용은 이 화면에서만 유지됩니다.")
  }
}

/** 마지막으로 쓴 담당자 이름 — 매번 다시 치지 않게 기억해 둔다 */
export const lastEditor = () => {
  try {
    return localStorage.getItem(EDITOR_KEY) || ""
  } catch {
    return ""
  }
}

export function saveOverride(
  store: TaxOvStore,
  id: string,
  e: Omit<TaxOvEntry, "at">,
): TaxOvStore {
  const prev = store[id]
  const entry: TaxOvEntry = { ...e, at: new Date().toLocaleString("ko-KR", { hour12: false }) }
  const next: TaxOvStore = {
    ...store,
    // 이전 값은 history 로 밀어 둔다 — 무엇을 어떻게 고쳐 왔는지가 이 기능의 목적이다
    [id]: { ...entry, history: prev ? [{ ...prev, history: undefined } as TaxOvEntry, ...prev.history] : [] },
  }
  try {
    localStorage.setItem(EDITOR_KEY, e.by)
  } catch {
    /* 이름 기억은 실패해도 그만이다 */
  }
  persist(next)
  return next
}

export function clearOverride(store: TaxOvStore, id: string): TaxOvStore {
  const next = { ...store }
  delete next[id]
  persist(next)
  return next
}

/** 수정이 반영된 행 */
export interface SettleRowX extends SettleRow {
  ov: TaxOv | null
  billMediaAdj: number | null
  billFeeAdj: number | null
  taxKrwAdj: number | null
}

/**
 * 수정값을 얹는다. 발행 금액은 **두 값의 합**이고, 처리주체가 HSAD 면 매체비를 광고주가
 * 매체에 직접 지불하므로 수수료만 발행한다 — 내부 대시보드(calc.py)와 같은 규칙이다.
 */
export function applyOverrides(rows: SettleRow[], store: TaxOvStore): SettleRowX[] {
  return rows.map((r) => {
    const ov = store[r.id] || null
    if (!ov) {
      return { ...r, ov: null, billMediaAdj: r.billMedia, billFeeAdj: r.billFee, taxKrwAdj: r.taxKrw }
    }
    const media = ov.media ?? r.billMedia
    const fee = ov.fee ?? r.billFee
    const tax =
      fee === null ? null : r.owner === "HSAD" ? fee : media === null ? null : media + fee
    return { ...r, ov, billMediaAdj: media, billFeeAdj: fee, taxKrwAdj: tax }
  })
}

/** 셀에 붙일 수정 내역 — 마우스를 올리면 보이는 글 */
export function ovTitle(ov: TaxOv): string {
  const one = (e: TaxOvEntry, head: string) =>
    [
      head,
      e.media !== null ? `매체비 ${e.media.toLocaleString("ko-KR")}원` : "",
      e.fee !== null ? `수수료 ${e.fee.toLocaleString("ko-KR")}원` : "",
      `담당자 ${e.by}`,
      `사유 ${e.reason}`,
      e.plan ? `처리방안 ${e.plan}` : "",
      e.at,
    ]
      .filter(Boolean)
      .join(" · ")
  return [
    one(ov, "✎ 수기 수정"),
    ...ov.history.map((h, i) => one(h, `이전 ${ov.history.length - i}`)),
    "— 이 대시보드에서만 반영되며 내부 정산 데이터는 그대로입니다",
  ].join("\n")
}
