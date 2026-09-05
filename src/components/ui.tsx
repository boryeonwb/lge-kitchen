import { useEffect, useRef, useState, type ReactNode } from "react"
import { useView } from "#/lib/view"
import { MONLBL, f2 } from "#/lib/format"
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
  /** 마우스를 올렸을 때 보일 산식·근거. 화면은 숫자만 두고 근거는 여기 담는다 */
  title?: string
}

/** KPI — 세리프가 감정 노동을 하는 자리. 숫자만 40px 디스플레이로 올린다. */
export function KpiCards({ items }: { items: Kpi[] }) {
  // 정확한 원 단위 금액은 카드 폭을 넘어간다 → 길이에 따라 크기를 내린다.
  // 크기는 **가장 긴 값 하나로 정해 전부에 같이** 준다. 카드마다 재면 나란히 선
  // 숫자들의 크기가 제각각이 되어(발행금액만 작고 나머지는 크게) 눈에 거슬린다.
  const longest = items.reduce((a, it) => Math.max(a, String(it.v).length), 0)
  const size = longest > 12 ? "text-[24px]" : longest > 8 ? "text-[30px]" : "text-[40px]"
  return (
    <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      {items.map((it) => (
        <div key={it.k} title={it.title} className="rounded-[12px] bg-paper px-6 py-5 shadow-soft">
          <div className="text-[11px] tracking-[0.08em] text-fog uppercase">{it.k}</div>
          <div className={cn("display mt-2 tabular-nums", size)}>
            {it.v}
            {it.u ? <span className="ml-1 font-sans text-[13px] text-fog">{it.u}</span> : null}
          </div>
          <div className="mt-1.5 text-[12px] leading-[1.5] text-fog">{it.s}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * 눌러서 복사하는 숫자 칸 — 매체 세팅 창에 그대로 붙여 넣을 값에 쓴다.
 *
 * 복사되는 건 **화면 표기 그대로**(`1,234.56`)가 아니라 자릿수 구분 없는 원값이다.
 * 매체 입력칸은 콤마가 들어가면 안 받거나 다른 숫자로 읽는다.
 *
 * `navigator.clipboard` 는 보안 컨텍스트(https·localhost)에서만 있다. 같은 망의 다른
 * PC 가 `http://192.168.x.x:3100` 으로 열면 없으므로, 눈에 안 보이는 textarea 에
 * `execCommand("copy")` 로 물러선다 — 안 되면 조용히 실패하는 대신 알려 준다.
 */
export function Copyable({
  v,
  className,
  title,
}: {
  v: number
  className?: string
  title?: string
}) {
  const [done, setDone] = useState(false)
  const text = String(v)

  const copy = async () => {
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.cssText = "position:fixed;left:-9999px;top:0"
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand("copy")
        ta.remove()
      } catch {
        ok = false
      }
    }
    if (!ok) return alert(`복사하지 못했습니다. 직접 복사해 주세요 — ${text}`)
    setDone(true)
    setTimeout(() => setDone(false), 900)
  }

  return (
    <b
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        void copy()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          void copy()
        }
      }}
      title={`${title ? title + " · " : ""}누르면 ${text} 를 복사합니다`}
      className={cn("cursor-copy", done && "tint tint-ok", className)}
    >
      {done ? "복사됨" : f2(v)}
    </b>
  )
}

/**
 * 국가 셀 — 영문 표기 옆에 한글명을 작게 붙인다.
 * 열 폭이 고정이라 긴 이름은 잘린다(`Czech Republ…`) → 전체 이름을 툴팁에 담는다.
 */
export function CountryCell({ ctry, kor }: { ctry: string; kor?: string }) {
  const full = kor && kor !== ctry ? `${ctry} (${kor})` : ctry
  return (
    <span title={full}>
      {ctry}
      {kor && kor !== ctry ? <span className="ml-1.5 text-[11px] text-fog">{kor}</span> : null}
    </span>
  )
}
