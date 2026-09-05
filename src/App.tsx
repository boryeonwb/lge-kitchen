import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Col } from "#/components/DataTable"
import * as api from "#/lib/api"
import type { OpsPayload, SettlePayload } from "#/lib/api"
import { ViewContext, type SortState, type ViewCtx } from "#/lib/view"
import { MONLBL } from "#/lib/format"
import { cn } from "#/lib/utils"
import { OpsView } from "#/views/OpsView"
import { SettlementView } from "#/views/SettlementView"

/**
 * 광고주 공유용 운영·정산 대시보드.
 *
 * 이 앱에는 계산이 없다 — 숫자는 lge-billing-dashboard 백엔드의 `/api/adv/*` 에서
 * 그대로 온다. 내부 대시보드와 같은 계산 결과를 쓰므로 두 화면이 어긋날 수 없다.
 * 읽기 전용이라 저장 경로도 없다.
 *
 * 두 탭은 소스가 달라(정산 = 인보이스 집계 / 운영 = 품의예산 시트 + 소진) 각각
 * 따로 받는다. 운영 쪽은 미디어믹스 시트를 다시 받을 수 있어 응답이 느릴 때가 있는데,
 * 한 번에 묶으면 정산 탭까지 그만큼 기다리게 된다.
 */

const TABS: Array<[string, string]> = [
  ["settle", "정산"],
  ["ops", "운영"],
]

function readHash(): { tab?: string; mon?: string } {
  const [t, m] = decodeURIComponent(location.hash.replace(/^#/, "")).split("/")
  return { tab: TABS.some(([id]) => id === t) ? t : undefined, mon: m || undefined }
}

export function App() {
  const [tab, setTab] = useState(() => readHash().tab || "settle")
  const [S, setS] = useState<SettlePayload | null>(null)
  const [O, setO] = useState<OpsPayload | null>(null)
  const [busy, setBusy] = useState<string | null>("불러오는 중…")
  const [err, setErr] = useState("")
  const [mon, setMonState] = useState<string | null>(() => readHash().mon ?? null)
  const [filt, setFiltState] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<Record<string, SortState>>({})
  const lastTable = useRef<{ cols: unknown[]; data: unknown[] } | null>(null)

  const load = useCallback(async () => {
    setBusy("불러오는 중…")
    setErr("")
    // 한쪽이 실패해도 다른 탭은 보여준다 — 운영 탭은 외부 시트를 받으므로 더 잘 실패한다
    const [s, o] = await Promise.allSettled([api.fetchSettlement(), api.fetchOps()])
    if (s.status === "fulfilled") setS(s.value)
    if (o.status === "fulfilled") setO(o.value)
    const bad = [
      s.status === "rejected" ? `정산: ${(s.reason as Error).message}` : "",
      o.status === "rejected" ? `운영: ${(o.reason as Error).message}` : "",
    ].filter(Boolean)
    setErr(bad.join(" · "))
    setBusy(null)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 월 선택 기본값은 마지막 달 — 주소창에 월이 실려 있으면 그 값을 존중한다.
  // 빈 문자열("")은 '전체월' 을 고른 상태지 미선택이 아니라 null 과 구분해서 다룬다.
  const months = S?.months ?? []
  const curMon = mon !== null && (mon === "" || months.includes(mon))
    ? mon
    : (months[months.length - 1] ?? "")

  const syncHash = useCallback((t: string, m: string) => {
    history.replaceState(null, "", `#${t}${t === "settle" && m ? `/${m}` : ""}`)
  }, [])

  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      if (h.tab) setTab(h.tab)
      if (h.mon) setMonState(h.mon)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const setMon = useCallback(
    (m: string) => {
      setMonState(m)
      syncHash("settle", m)
    },
    [syncHash],
  )

  const setFilt = useCallback((key: string, value: string) => {
    setFiltState((p) => ({ ...p, [key]: value }))
  }, [])

  const toggleSort = useCallback((key: string, col: string) => {
    setSort((p) => {
      const c = p[key]
      return { ...p, [key]: c && c.k === col ? { k: col, dir: -c.dir } : { k: col, dir: 1 } }
    })
  }, [])

  const registerTable = useCallback((t: { cols: unknown[]; data: unknown[] }) => {
    lastTable.current = t
  }, [])

  const ctx: ViewCtx = useMemo(
    () => ({
      tab,
      mon: curMon,
      setMon,
      months,
      filt,
      setFilt,
      sort,
      toggleSort,
      registerTable,
    }),
    [tab, curMon, setMon, months, filt, setFilt, sort, toggleSort, registerTable],
  )

  const exportCsv = useCallback(() => {
    const t = lastTable.current
    if (!t) return
    const cols = t.cols as Col[]
    const data = t.data as Array<Record<string, unknown>>
    const cell = (c: Col, r: Record<string, unknown>) => {
      const v = r[c.k]
      // 소계·총계 행은 이미 포맷된 값이라 fmt 를 태우지 않는다
      if (r.__type) return typeof v === "string" ? v : ""
      if (c.csv) return c.csv(v, r)
      return v === null || v === undefined ? "" : String(v)
    }
    const q = (v: unknown) =>
      /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    const csv = [cols.map((c) => q(c.l.replace(/\n/g, " "))).join(",")]
      .concat(data.map((r) => cols.map((c) => q(cell(c, r))).join(",")))
      .join("\r\n")
    // 앞의 BOM 은 엑셀이 UTF-8 로 열게 한다 (없으면 한글이 깨진다)
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `LGE_${tab === "ops" ? "운영" : "정산"}${
      tab === "settle" && curMon ? `_${MONLBL(curMon)}` : ""
    }.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [curMon, tab])

  const ready = tab === "ops" ? O : S

  return (
    <div>
      <header className="sticky top-0 z-[60] flex flex-wrap items-center gap-3.5 bg-hdr px-4 py-2.5 text-white shadow-[0_1px_6px_rgba(0,0,0,.25)]">
        <h1 className="m-0 text-[15px] font-bold tracking-[-0.2px]">
          LG전자 냉장고 운영·정산 대시보드
        </h1>
        <span className="text-xs opacity-85">
          {S ? `정산 갱신 ${S.generatedAt}` : ""}
          {O?.mix.fetchedAt ? ` · 품의예산 시트 ${O.mix.fetchedAt}` : ""}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={exportCsv}
          className="cursor-pointer rounded border border-[rgba(255,255,255,.45)] bg-transparent px-3 py-1.5 text-xs text-white hover:bg-[rgba(255,255,255,.14)]"
        >
          CSV 내보내기
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void load()}
          className="cursor-pointer rounded border border-white bg-white px-3 py-1.5 text-xs font-bold text-hdr hover:bg-[#eef2f8] disabled:opacity-50"
        >
          🔄 새로고침
        </button>
      </header>

      {err ? (
        <div className="border-b border-warn-line bg-warn-bg px-4 py-2 text-xs text-warn-ink">
          <b>불러오지 못한 자료가 있습니다</b> — {err}
        </div>
      ) : null}

      <nav className="sticky top-0 z-50 flex gap-0.5 overflow-x-auto border-b border-line bg-surface px-3">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id)
              syncHash(id, curMon)
              window.scrollTo({ top: 0 })
            }}
            className={cn(
              "cursor-pointer whitespace-nowrap border-b-[3px] bg-transparent px-6 py-2.5 text-[13px]",
              tab === id
                ? "border-hdr font-bold text-hdr"
                : "border-transparent text-ink2 hover:bg-[#f0f2f5]",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="px-4 pb-16 pt-3.5">
        {ready ? (
          <ViewContext.Provider value={ctx}>
            {tab === "ops" ? <OpsView D={O!} /> : <SettlementView D={S!} />}
          </ViewContext.Provider>
        ) : busy ? null : (
          <div className="rounded-md border border-line bg-surface px-4 py-6 text-[12.5px] text-muted">
            표시할 자료가 없습니다. [새로고침]을 눌러 다시 시도해 주세요.
          </div>
        )}
      </main>

      {busy ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-[rgba(244,245,247,.72)] text-sm font-bold text-hdr">
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-[2.5px] border-[rgba(48,84,150,.25)] border-t-hdr" />
          {busy}
        </div>
      ) : null}
    </div>
  )
}
