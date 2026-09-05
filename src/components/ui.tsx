import { useEffect, useRef, useState, type ReactNode } from "react"
import { useView } from "#/lib/view"
import { MONLBL } from "#/lib/format"
import { cn } from "#/lib/utils"

export function Card({
  title,
  children,
  className,
}: {
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-line bg-surface", className)}>
      <h2 className="m-0 border-b border-line bg-[#fafbfc] px-3 py-2 text-[12.5px] font-bold text-ink2">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("toolbar mb-2.5 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  )
}

export function Spacer() {
  return <span className="flex-1" />
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] text-muted">{children}</span>
}

/** 월 탭 — 앞에 '전체' 버튼이 붙는다 ("" = 전체월) */
export function MonthTabs() {
  const { mon, setMon, months } = useView()
  const btn = (m: string, label: string) => (
    <button
      key={m || "all"}
      type="button"
      onClick={() => setMon(m)}
      className={cn(
        "rounded border px-3.5 py-1 text-xs",
        mon === m
          ? "border-hdr bg-hdr font-bold text-white"
          : "border-line bg-surface text-ink2 hover:bg-[#f0f2f5]",
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-1">
      {btn("", "전체")}
      {months.map((m) => btn(m, MONLBL(m)))}
    </div>
  )
}

const CONTROL = "max-w-[190px] rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink"

/** 필터 드롭다운 — 값은 filt[fkey] 에 저장된다 */
export function FilterSelect({
  fkey,
  label,
  values,
  display,
}: {
  fkey: string
  label: string
  values: string[]
  display?: (v: string) => string
}) {
  const { filt, setFilt } = useView()
  return (
    <select
      className={CONTROL}
      value={filt[fkey] ?? ""}
      onChange={(e) => setFilt(fkey, e.target.value)}
    >
      <option value="">{label} (전체)</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {display ? display(v) : v}
        </option>
      ))}
    </select>
  )
}

/**
 * 쉼표로 저장된 다중 선택 값 → 지금 후보에 실제로 존재하는 것만 남긴 Set.
 *
 * 빈 Set 은 "전체" 를 뜻한다. 연쇄 드롭다운에서 앞 선택이 바뀌면 후보가 줄어드는데,
 * 사라진 값이 남아 있으면 아무 행도 안 보이는 상태가 되므로 여기서 걸러낸다.
 */
export const pickSet = (raw: string | undefined, values: string[]) =>
  new Set((raw || "").split(",").filter((v) => v && values.includes(v)))

/** 다중 선택 필터 — 체크박스 목록. 값은 filt[fkey] 에 쉼표로 이어 저장한다. */
export function MultiFilterSelect({
  fkey,
  label,
  values,
  display,
}: {
  fkey: string
  label: string
  values: string[]
  display?: (v: string) => string
}) {
  const { filt, setFilt } = useView()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // 바깥을 누르면 닫는다 (열려 있을 때만 리스너를 건다)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const sel = pickSet(filt[fkey], values)
  const show = (v: string) => (display ? display(v) : v)
  const toggle = (v: string) => {
    const next = new Set(sel)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    // values 순서로 다시 이어 붙여, 고른 순서와 무관하게 표기가 일정하다
    setFilt(fkey, values.filter((x) => next.has(x)).join(","))
  }

  const lab =
    sel.size === 0
      ? `${label} (전체)`
      : sel.size === 1
        ? `${label}: ${show([...sel][0])}`
        : `${label} ${sel.size}개`

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={sel.size ? [...sel].map(show).join(", ") : `${label} — 여러 개 고를 수 있습니다`}
        className={cn(CONTROL, "flex items-center gap-1", sel.size ? "font-bold text-hdr" : "")}
      >
        <span className="truncate">{lab}</span>
        <span className="text-[9px] leading-none text-muted">▼</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+2px)] z-30 max-h-64 min-w-[160px] overflow-auto rounded border border-line bg-surface p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setFilt(fkey, "")}
            disabled={!sel.size}
            className="mb-1 w-full rounded px-1.5 py-0.5 text-left text-[11px] text-muted enabled:hover:bg-[#f0f2f5] disabled:opacity-40"
          >
            {sel.size ? `선택 해제 (${sel.size}개)` : "전체"}
          </button>
          {values.map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-xs hover:bg-[#f0f2f5]"
            >
              <input type="checkbox" checked={sel.has(v)} onChange={() => toggle(v)} />
              <span>{show(v)}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface Kpi {
  k: string
  v: ReactNode
  u?: string
  s: ReactNode
  state?: "ok" | "bad"
}

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
      {items.map((it) => (
        <div key={it.k} className="rounded-md border border-line bg-surface px-3.5 py-3">
          <div className="text-[11.5px] text-ink2">{it.k}</div>
          <div
            className={cn(
              "mt-0.5 text-[23px] font-bold tracking-[-0.5px]",
              it.state === "ok" && "text-gain",
              it.state === "bad" && "text-danger",
            )}
          >
            {it.v}
            {it.u ? <span className="ml-0.5 text-xs font-normal text-ink2">{it.u}</span> : null}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{it.s}</div>
        </div>
      ))}
    </div>
  )
}

/** 국가 셀 — 영문 표기 옆에 한글명을 작게 붙인다 */
export function CountryCell({ ctry, kor }: { ctry: string; kor?: string }) {
  return (
    <>
      {ctry}
      {kor && kor !== ctry ? <span className="ml-1 text-[11.5px] text-muted">{kor}</span> : null}
    </>
  )
}
