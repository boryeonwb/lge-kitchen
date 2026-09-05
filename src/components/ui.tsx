import { useEffect, useRef, useState, type ReactNode } from "react"
import { useView } from "#/lib/view"
import { MONLBL } from "#/lib/format"
import { cn } from "#/lib/utils"

/**
 * 공통 UI — Popcorn 스타일.
 *
 * 규칙 두 가지만 지키면 나머지는 따라온다.
 *   · 인터랙티브 표면(버튼·배지·드롭다운)은 전부 pill(100px)
 *   · 20px 이상 제목만 세리프(.display), 그 아래는 전부 사스
 * 그림자는 --shadow-soft 하나뿐이고 다른 값은 쓰지 않는다.
 */

/** 페이퍼 화이트 판. 제목은 세리프, 설명은 안개색 사스 한 단락. */
export function Card({
  title,
  note,
  children,
  className,
}: {
  title: ReactNode
  /** 제목 아래 설명 — 읽는 법·계산 근거처럼 한 번 읽으면 되는 내용 */
  note?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-[12px] bg-paper shadow-soft", className)}>
      <div className="border-b border-graphite/10 px-6 py-4">
        <h2 className="display m-0 text-[22px]">{title}</h2>
        {/* 한 줄이 화면 폭만큼 길어지면 읽히지 않는다 — 측정 길이를 잡아 둔다 */}
        {note ? (
          <p className="m-0 mt-2 max-w-[96ch] text-[12px] leading-[1.6] text-fog">{note}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("toolbar mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>
  )
}

export function Spacer() {
  return <span className="flex-1" />
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className="text-[12px] leading-[1.5] text-fog">{children}</span>
}

const PILL_BASE = "pill cursor-pointer whitespace-nowrap px-4 py-2 text-[13px]"
/** 채운 pill — 화면에 하나둘만 둔다. 많아지면 무게를 잃는다 */
export const btnFilled = cn(PILL_BASE, "bg-graphite font-semibold text-paper hover:bg-[#2c2a2a]")
/** 고스트 pill — 헤어라인 테두리, 채움 없음 */
export const btnGhost = cn(PILL_BASE, "border border-graphite/25 bg-transparent hover:bg-cream")

/** 월 탭 — 앞에 '전체' 버튼이 붙는다 ("" = 전체월) */
export function MonthTabs() {
  const { mon, setMon, months } = useView()
  const btn = (m: string, label: string) => (
    <button
      key={m || "all"}
      type="button"
      onClick={() => setMon(m)}
      className={cn(
        "pill cursor-pointer px-4 py-2 text-[13px]",
        mon === m
          ? "bg-graphite font-semibold text-paper"
          : "border border-graphite/15 bg-paper hover:bg-cream",
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-1.5">
      {btn("", "전체")}
      {months.map((m) => btn(m, MONLBL(m)))}
    </div>
  )
}

const CONTROL = "pill max-w-[210px] border border-graphite/20 bg-paper px-4 py-2 text-[13px]"

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
  const on = !!filt[fkey]
  return (
    <select
      className={cn(CONTROL, "cursor-pointer", on && "border-graphite/60 font-semibold")}
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
        className={cn(
          CONTROL,
          "flex cursor-pointer items-center gap-2",
          sel.size && "border-graphite/60 font-semibold",
        )}
      >
        <span className="truncate">{lab}</span>
        <span className="text-[8px] leading-none text-fog">▼</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-72 min-w-[180px] overflow-auto rounded-[12px] bg-paper p-2 shadow-soft ring-1 ring-graphite/10">
          <button
            type="button"
            onClick={() => setFilt(fkey, "")}
            disabled={!sel.size}
            className="pill mb-1 w-full cursor-pointer px-3 py-1.5 text-left text-[12px] text-fog enabled:hover:bg-cream disabled:opacity-40"
          >
            {sel.size ? `선택 해제 (${sel.size}개)` : "전체"}
          </button>
          {values.map((v) => (
            <label
              key={v}
              className="pill flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[13px] hover:bg-cream"
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
}

/** KPI — 세리프가 감정 노동을 하는 자리. 숫자만 40px 디스플레이로 올린다. */
export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      {items.map((it) => (
        <div key={it.k} className="rounded-[12px] bg-paper px-6 py-5 shadow-soft">
          <div className="text-[11px] tracking-[0.08em] text-fog uppercase">{it.k}</div>
          {/* 정확한 원 단위 금액은 열 자리를 넘어간다 — 길이에 따라 크기를 내려
              카드 밖으로 넘치거나 줄바꿈되지 않게 한다 */}
          <div
            className={cn(
              "display mt-2 tabular-nums",
              String(it.v).length > 12
                ? "text-[24px]"
                : String(it.v).length > 8
                  ? "text-[30px]"
                  : "text-[40px]",
            )}
          >
            {it.v}
            {it.u ? <span className="ml-1 font-sans text-[13px] text-fog">{it.u}</span> : null}
          </div>
          <div className="mt-1.5 text-[12px] leading-[1.5] text-fog">{it.s}</div>
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
      {kor && kor !== ctry ? <span className="ml-1.5 text-[11px] text-fog">{kor}</span> : null}
    </>
  )
}
