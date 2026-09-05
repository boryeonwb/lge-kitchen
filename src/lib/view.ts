import { createContext, useContext } from "react"

export interface SortState {
  k: string
  dir: number
}

/** 화면 상태 — 필터·정렬·월 선택·CSV. 서버에 남는 값(이관 배분)은 여기 두지 않는다. */
export interface ViewCtx {
  /** 현재 탭 — 정렬 상태의 기본 키 */
  tab: string
  /** 정산 탭의 선택 월 ("" = 전체월) */
  mon: string
  setMon: (mon: string) => void
  /** 정산 탭 월 목록 */
  months: string[]
  filt: Record<string, string>
  setFilt: (key: string, value: string) => void
  sort: Record<string, SortState>
  toggleSort: (key: string, col: string) => void
  /** CSV 내보내기용 — 마지막으로 렌더된 표 */
  registerTable: (t: { cols: unknown[]; data: unknown[] }) => void
}

export const ViewContext = createContext<ViewCtx | null>(null)

export function useView(): ViewCtx {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error("ViewContext 밖에서 useView 를 호출했습니다")
  return ctx
}
