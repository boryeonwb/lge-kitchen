import type { SettleRow, TaxOvRec } from "#/lib/api"

/**
 * 세금계산서 매체비·수수료 수기 수정.
 *
 * 수정 기록은 두 갈래다.
 *   ① **내부 대시보드에서 고친 것** (`row.taxOv`) — 여럿이 같이 보는 공식 기록이고,
 *      금액은 서버가 이미 반영해 내려 준다. 여기서는 근거만 보여 준다.
 *   ② **이 화면에서 고친 것** (아래 localStorage) — 이 브라우저에만 남는 가계산이다.
 * 화면에서 둘을 섞어 보여 주되 **어느 쪽인지 반드시 구분**한다 — 공유되는 줄 알고
 * 넘어가면 다른 사람 화면엔 없는 숫자를 근거로 일이 진행된다.
 *
 * 이 화면의 수정은 서버에 쓰지 않는다(지시) — 저장소가 localStorage 라 탭을 닫아도
 * 남지만 다른 사람 화면에는 가지 않는다. **공유해야 하는 수정은 내부 대시보드에서**
 * 해야 하고, 그렇게 한 것이 위 ①로 여기 그대로 따라 들어온다.
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
  /** 이 브라우저에만 있는 수정 */
  ov: TaxOv | null
  /** 내부 대시보드에서 고친 기록 (공유됨) */
  srvOv: TaxOvRec | null
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
    const srvOv = r.taxOv || null
    if (!ov) {
      return {
        ...r,
        ov: null,
        srvOv,
        billMediaAdj: r.billMedia,
        billFeeAdj: r.billFee,
        taxKrwAdj: r.taxKrw,
      }
    }
    const media = ov.media ?? r.billMedia
    const fee = ov.fee ?? r.billFee
    const tax =
      fee === null ? null : r.owner === "HSAD" ? fee : media === null ? null : media + fee
    return { ...r, ov, srvOv, billMediaAdj: media, billFeeAdj: fee, taxKrwAdj: tax }
  })
}

/** 금액 한 줄 — 비운 항목은 자동 계산값을 쓴 것이라 적지 않는다 */
const money = (v: number | null | undefined, l: string) =>
  v === null || v === undefined ? "" : `${l} ${v.toLocaleString("ko-KR")}원`

const line = (
  e: { media: number | null; fee: number | null; by: string; reason: string; at: string },
  head: string,
  plan?: string,
) =>
  [head, money(e.media, "매체비"), money(e.fee, "수수료"), e.by, e.reason, plan ? `처리방안 ${plan}` : "", e.at]
    .filter(Boolean)
    .join(" · ")

/**
 * 셀에 붙일 수정 내역 — 마우스를 올리면 보이는 글.
 * 내부(공유) 기록을 먼저 내고, 이 브라우저에만 있는 가계산은 뒤에 따로 표시한다.
 */
export function ovTitle(srv: TaxOvRec | null, local: TaxOv | null): string {
  const out: string[] = []
  if (srv) {
    out.push(line(srv, "✎ 내부 대시보드 수정 (공유)"))
    srv.history.forEach((h, i) => out.push(line(h, `   이전 ${srv.history.length - i}`)))
  }
  if (local) {
    if (out.length) out.push("")
    out.push(line(local, "✎ 이 화면에서 수정", local.plan))
    local.history.forEach((h, i) =>
      out.push(line(h, `   이전 ${local.history.length - i}`, h.plan)),
    )
    out.push("   ↑ 이 브라우저에만 있습니다 — 다른 사람 화면에는 반영되지 않습니다")
  }
  return out.join("\n")
}
