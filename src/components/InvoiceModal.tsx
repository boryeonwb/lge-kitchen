import { useEffect, useState } from "react"
import { invoiceUrl, type InvoiceRef, type SettleRow } from "#/lib/api"
import { btnGhost } from "#/components/ui"
import { cn } from "#/lib/utils"
import { MONLBL, f2 } from "#/lib/format"

/**
 * 인보이스 PDF 뷰어 — 그 행의 숫자가 어느 줄에서 나왔는지 PDF 안에서 짚어 준다.
 *
 * 집계행 하나가 인보이스 여러 건에 걸치는 경우가 있어(같은 국가가 두 계정으로 나뉜
 * 달) 파일 목록을 같이 둔다. **하이라이트**는 그 행에 합산된 개별 라인 금액을 서버가
 * PDF 안에서 찾아 형광 표시한 사본이다 — 숫자만 보여 주면 "이 금액이 어디서 왔는가" 를
 * 결국 사람이 PDF 를 열어 다시 찾아야 한다.
 *
 * 머리말에 통화·적용환율·최종금액을 같이 세운다. PDF 는 인보이스 통화로 적혀 있어서,
 * 화면의 KRW 와 맞춰 보려면 무슨 환율이 곱해졌는지가 같은 자리에 있어야 한다.
 */
export function InvoiceModal({
  row,
  index,
  onIndexChange,
  onClose,
}: {
  row: SettleRow
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const [hl, setHl] = useState(true)
  const list: InvoiceRef[] = row.invoices || []
  const it = list[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  if (!it) return null
  const n = it.amts?.length || 0
  const url = invoiceUrl(it, hl)

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-graphite/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full w-[min(1140px,100%)] flex-col overflow-hidden rounded-[12px] bg-paper shadow-soft">
        <div className="border-b border-graphite/10 px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="display m-0 text-[19px]">인보이스</h2>
            <span className="text-[12px] text-fog">
              {MONLBL(row.mon)} · {row.sol} · {row.ctry}
              {row.phase ? ` · ${row.phase}` : ""} · {row.med}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="pill cursor-pointer px-3 py-1 text-[12.5px] text-fog hover:bg-cream"
            >
              닫기 ✕
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
            <span className="text-fog">
              통화 <b className="font-semibold text-graphite">{row.cur || "—"}</b>
            </span>
            <span className="text-fog">
              적용환율{" "}
              <b className="font-semibold text-graphite tabular-nums">
                {row.taxFx == null ? "미입력" : f2(row.taxFx)}
              </b>
            </span>
            <span className="text-fog">
              최종 인보이스 금액{" "}
              <b className="font-semibold text-graphite tabular-nums">{f2(row.billed)}</b>{" "}
              {row.cur}
            </span>
            <span className="text-fog">
              전체 인보이스 금액{" "}
              <b className="font-semibold text-graphite tabular-nums">{f2(row.invTotal)}</b>{" "}
              {row.cur}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {list.length > 1 ? (
              <select
                value={index}
                onChange={(e) => onIndexChange(Number(e.target.value))}
                className="pill max-w-[420px] cursor-pointer border border-graphite/20 bg-paper px-3 py-1 text-[12px]"
              >
                {list.map((x, k) => (
                  <option key={x.path} value={k}>
                    {x.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[12px] font-semibold">{it.name}</span>
            )}
            <span className="text-[11.5px] text-fog">
              {it.path.split("/")[0]} 폴더
              {n ? ` · 이 행에 합산된 라인 ${n}건` : ""}
              {list.length > 1 ? ` · 인보이스 ${list.length}건` : ""}
            </span>

            <span className="flex-1" />

            {n ? (
              <button
                type="button"
                title="이 행에 합산된 개별 라인 금액을 PDF 안에서 형광 표시합니다"
                onClick={() => setHl((v) => !v)}
                className={cn(
                  "pill cursor-pointer px-3 py-1 text-[12px]",
                  hl ? "bg-amber font-semibold" : "border border-graphite/20 text-fog hover:bg-cream",
                )}
              >
                하이라이트 {hl ? "ON" : "OFF"}
              </button>
            ) : null}
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className={cn(btnGhost, "px-3 py-1 text-[12px] no-underline")}
            >
              새 탭 ↗
            </a>
          </div>
        </div>

        <iframe
          key={url}
          src={url}
          title="인보이스 PDF"
          className="w-full flex-1 border-0 bg-cream"
        />
      </div>
    </div>
  )
}

/**
 * 인보이스 최종금액 칸 안의 열기 단추.
 *
 * 금액은 오른쪽에 붙어 있어 칸 왼쪽이 늘 비어 있었다. 열을 새로 만들면 다른 열을
 * 그만큼 좁혀야 하므로, 이미 비어 있는 자리에 세운다.
 */
export function InvoiceCheck({ list, onOpen }: { list: InvoiceRef[]; onOpen: () => void }) {
  if (!list?.length) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={`인보이스 보기 — ${list.map((i) => i.name).join("\n")}`}
      className="float-left cursor-pointer rounded-[6px] border border-graphite/20 px-1 text-[10.5px] leading-[15px] text-fog hover:bg-amber hover:text-graphite"
    >
      ✓{list.length > 1 ? <b className="ml-0.5 font-semibold">{list.length}</b> : null}
    </button>
  )
}
