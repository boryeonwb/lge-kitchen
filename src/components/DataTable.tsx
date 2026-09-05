import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { useView } from "#/lib/view"
import { cn } from "#/lib/utils"

/** 열 정의. 내부 대시보드와 같은 계약이라 열을 옮겨 붙일 수 있다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Col<R = any> {
  k: string
  /** 같은 값을 여러 자리에 보여줄 때(월별 소진) React 키를 갈라 준다. 없으면 k */
  id?: string
  /** 헤더 라벨. \n 은 두 줄로 렌더된다 (white-space: pre-line) */
  l: string
  w?: number
  cls?: string
  nosort?: boolean
  fmt?: (v: any, r: R) => ReactNode
  cellCls?: (r: R) => string
  /** CSV 내보내기용 평문. 없으면 원본 값을 그대로 쓴다 */
  csv?: (v: any, r: R) => string
  /** 열 묶음 키 — 같은 값이 연속하면 상단에 묶음 헤더가 하나로 붙고 배경색이 같아진다 */
  grp?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableRow = Record<string, any> & {
  /** 소계행 / 총계행 — 값은 이미 포맷된 문자열이라 fmt 를 타지 않는다 */
  __type?: "sub" | "grand"
}

/** 열 묶음 — 라벨과 색. 정산 탭의 두 묶음을 색으로 가른다. */
export const COL_GROUPS: Record<string, { l: string; head: string; cell: string }> = {
  inv: { l: "인보이스", head: "gh-inv", cell: "g-inv" },
  tax: { l: "세금계산서 발행", head: "gh-tax", cell: "g-tax" },
}

/** 연속한 같은 grp 을 하나로 묶는다 */
function groupSpans(cols: Col[]): Array<{ g?: string; span: number }> {
  const out: Array<{ g?: string; span: number }> = []
  for (const c of cols) {
    const last = out[out.length - 1]
    if (last && last.g === c.grp) last.span += 1
    else out.push({ g: c.grp, span: 1 })
  }
  return out
}

interface Props {
  cols: Col[]
  rows: TableRow[]
  /** 정렬 상태 저장 키. 한 화면에 표가 둘 이상이면 구분해서 넘긴다 */
  sortKey?: string
  nosort?: boolean
  /** 왼쪽에서부터 고정할 열 개수 */
  freeze?: number
  /** 묶음 헤더 줄을 낼지 — 운영 탭처럼 묶음이 없는 표는 한 줄만 낸다 */
  grouped?: boolean
}

interface SortLike {
  k: string
  dir: number
}

/** 정렬은 데이터 행끼리만 한다 — 소계·총계는 순서에 관계없이 맨 아래에 붙인다. */
function sortRows(rows: TableRow[], st: SortLike): TableRow[] {
  const totals = rows.filter((r) => r.__type)
  const data = rows.filter((r) => !r.__type)
  return data
    .slice()
    .sort((a, b) => {
      const x = a[st.k]
      const y = b[st.k]
      if (x === y) return 0
      if (x === null || x === undefined || x === "") return 1
      if (y === null || y === undefined || y === "") return -1
      return typeof x === "number" && typeof y === "number"
        ? (x - y) * st.dir
        : String(x).localeCompare(String(y), "ko") * st.dir
    })
    .concat(totals)
}

export function DataTable({ cols, rows, sortKey, nosort, freeze, grouped }: Props) {
  const { tab, sort, toggleSort, registerTable } = useView()
  const key = sortKey || tab
  const st = nosort ? undefined : sort[key]
  const data = st ? sortRows(rows, st) : rows

  const tableRef = useRef<HTMLTableElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  // 왼쪽 N개 열 고정 — sticky 는 폭에 영향을 주지 않으므로 헤더 폭을 순차 실측해 left 를 누적한다.
  useLayoutEffect(() => {
    const tb = tableRef.current
    if (!tb || !freeze || !tb.tHead || !tb.tBodies[0]) return
    const ths = Array.from(tb.tHead.rows[tb.tHead.rows.length - 1].cells)
    const touched: HTMLTableCellElement[] = []
    const widths: number[] = []
    let x = 0
    for (let i = 0; i < freeze && i < ths.length; i++) {
      const w = ths[i].getBoundingClientRect().width
      const last = i === freeze - 1
      const mark = (el?: HTMLTableCellElement) => {
        if (!el) return
        el.style.left = `${x}px`
        el.classList.add("fz")
        el.classList.toggle("fz-last", last)
        touched.push(el)
      }
      mark(ths[i])
      for (const row of Array.from(tb.tBodies[0].rows)) mark(row.cells[i])
      widths.push(w)
      x += w
    }

    // 묶음 헤더 행도 같이 고정한다 — colSpan 때문에 열 인덱스가 1:1 로 맞지 않으므로
    // 앞에서부터 colSpan 을 누적해 "고정 범위 안에 완전히 들어가는" 묶음 셀만 붙인다.
    const grow = tb.tHead.rows.length > 1 ? tb.tHead.rows[0] : null
    if (grow) {
      let col = 0
      let gx = 0
      for (const cell of Array.from(grow.cells)) {
        const span = cell.colSpan || 1
        if (col + span > freeze) break
        cell.style.left = `${gx}px`
        cell.classList.add("fz")
        cell.classList.toggle("fz-last", col + span === freeze)
        touched.push(cell)
        for (let j = col; j < col + span; j++) gx += widths[j] ?? 0
        col += span
      }
    }
    return () => {
      for (const el of touched) {
        el.style.left = ""
        el.classList.remove("fz", "fz-last")
      }
    }
  }, [cols, data, freeze])

  // 표 위쪽 가로 스크롤바 — 아래 .scroll 과 scrollLeft 를 양방향 동기화.
  // 열이 30개를 넘어가는 표라 아래까지 내려가야 가로 스크롤을 만나는 건 못 쓴다.
  useEffect(() => {
    const sc = scrollRef.current
    const top = topRef.current
    const inner = innerRef.current
    if (!sc || !top || !inner) return
    const fit = () => {
      inner.style.width = `${sc.scrollWidth}px`
      top.style.display = sc.scrollWidth > sc.clientWidth + 1 ? "" : "none"
    }
    fit()
    const raf = requestAnimationFrame(fit) // 폰트·열폭 확정 후 재측정
    // 값이 같아지면 대입을 멈추므로 되울림 없음
    const onTop = () => {
      if (sc.scrollLeft !== top.scrollLeft) sc.scrollLeft = top.scrollLeft
    }
    const onSc = () => {
      if (top.scrollLeft !== sc.scrollLeft) top.scrollLeft = sc.scrollLeft
    }
    top.addEventListener("scroll", onTop)
    sc.addEventListener("scroll", onSc)
    const ro = new ResizeObserver(fit)
    ro.observe(sc)
    window.addEventListener("resize", fit)
    return () => {
      cancelAnimationFrame(raf)
      top.removeEventListener("scroll", onTop)
      sc.removeEventListener("scroll", onSc)
      ro.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [cols, data])

  useEffect(() => {
    registerTable({ cols, data })
  }, [cols, data, registerTable])

  return (
    <>
      <div ref={topRef} className="hstop">
        <div ref={innerRef} className="h-px" />
      </div>
      <div ref={scrollRef} className="scroll">
        <table ref={tableRef} className={cn("tbl", !grouped && "nogroup")}>
          <thead>
            {grouped ? (
              <tr className="grouprow">
                {groupSpans(cols).map((s, i) => {
                  const g = s.g ? COL_GROUPS[s.g] : undefined
                  return (
                    <th
                      key={`g${i}`}
                      colSpan={s.span}
                      className={cn("grouphead", g?.head, !g && "bg-hdr")}
                    >
                      {g?.l ?? ""}
                    </th>
                  )
                })}
              </tr>
            ) : null}
            <tr>
              {cols.map((c) => {
                const sortable = !nosort && !c.nosort
                const active = st && st.k === c.k
                return (
                  <th
                    key={c.id ?? c.k}
                    style={c.w ? { minWidth: c.w } : undefined}
                    className={cn(
                      sortable ? "cursor-pointer" : "cursor-default",
                      c.grp ? COL_GROUPS[c.grp]?.head : undefined,
                    )}
                    onClick={sortable ? () => toggleSort(key, c.k) : undefined}
                  >
                    {c.l}
                    {active ? (
                      <span className="text-[9px] opacity-65">{st!.dir > 0 ? "▲" : "▼"}</span>
                    ) : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              if (r.__type) {
                return (
                  <tr key={`${r.__type}-${i}`} className={r.__type}>
                    {cols.map((c) => (
                      <td key={c.id ?? c.k} className={c.cls}>
                        {r[c.k] !== undefined ? r[c.k] : ""}
                      </td>
                    ))}
                  </tr>
                )
              }
              return (
                <tr key={r.id ?? i}>
                  {cols.map((c) => (
                    <td
                      key={c.id ?? c.k}
                      className={cn(
                        c.grp ? COL_GROUPS[c.grp]?.cell : undefined,
                        c.cls,
                        c.cellCls?.(r),
                      )}
                    >
                      {c.fmt ? c.fmt(r[c.k], r) : (r[c.k] ?? "")}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
