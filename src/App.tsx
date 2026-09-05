import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Col } from "#/components/DataTable"
import * as api from "#/lib/api"
import type { OpsPayload, SettlePayload } from "#/lib/api"
import { ViewContext, type SortState, type ViewCtx } from "#/lib/view"
import { MONLBL } from "#/lib/format"
import { cn } from "#/lib/utils"
import { Spacer, btnFilled, btnGhost } from "#/components/ui"
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
  // 기본은 **전체월**(지시). 마지막 달을 기본으로 잡으면 다른 달을 보려고 매번
  // 탭을 눌러야 하고, 정산은 여러 달을 같이 훑는 일이 더 잦다.
  const curMon = mon !== null && (mon === "" || months.includes(mon)) ? mon : ""

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
      {/* 상단 바 하나로 끝낸다 — 로고 왼쪽, 탭 가운데, pill 액션 오른쪽.
          크림 캔버스 위 헤어라인 하나로 떠 있고, 진한 바를 두지 않는다. */}
      <header className="sticky top-0 z-[60] border-b border-graphite/10 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center gap-x-8 gap-y-3 px-8 py-4">
          <h1 className="display m-0 text-[22px]">LGE REF 운영·정산 대시보드</h1>

          <nav className="flex gap-7">
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
                  "relative cursor-pointer bg-transparent pb-1 text-[15px]",
                  tab === id
                    ? "font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-graphite after:content-['']"
                    : "text-fog hover:text-graphite",
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <Spacer />

          <span className="text-[12px] text-fog">
            {S ? `정산 갱신 ${S.generatedAt}` : ""}
            {O?.mix.fetchedAt ? ` · 품의예산 시트 ${O.mix.fetchedAt}` : ""}
          </span>
          <button type="button" onClick={exportCsv} className={btnGhost}>
            CSV 내보내기
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void load()}
            className={cn(btnFilled, "disabled:opacity-50")}
          >
            새로고침
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1720px] px-8 pb-20 pt-7">
        {err ? (
          <div className="mb-5 rounded-[12px] bg-amber px-6 py-4 text-[13px] leading-[1.5]">
            <b className="font-semibold">불러오지 못한 자료가 있습니다</b> — {err}
          </div>
        ) : null}

        {ready ? (
          <ViewContext.Provider value={ctx}>
            {tab === "ops" ? <OpsView D={O!} /> : <SettlementView D={S!} />}
          </ViewContext.Provider>
        ) : busy ? null : (
          <div className="rounded-[12px] bg-paper px-6 py-10 text-center text-[13px] text-fog shadow-soft">
            표시할 자료가 없습니다. [새로고침]을 눌러 다시 시도해 주세요.
          </div>
        )}
      </main>

      {busy ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-cream/75 text-[14px]">
          <span className="mr-2.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-graphite/20 border-t-graphite" />
          {busy}
        </div>
      ) : null}
    </div>
  )
}
