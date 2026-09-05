import { useEffect, useState } from "react"
import { f0, f2 } from "#/lib/format"
import { defaultTargets, type CarryRow } from "#/lib/carry"
import { btnFilled, btnGhost } from "#/components/ui"
import { cn } from "#/lib/utils"

/**
 * 잔여금 이관 팝업 — 어느 라인에 얼마를 넣을지 지정한다.
 *
 * 입력은 원 단위로 받지만 **저장은 잔여액 대비 비율(%)** 이다. 잔여액은 환율이
 * 갱신되면 같이 움직이는데(소진 KRW 가 환산값이라), 금액을 굳혀 두면 그때부터 배분
 * 합이 잔여액과 어긋난다. 비율로 두면 잔여액이 바뀌어도 지정한 배분이 따라간다.
 * 화면에도 금액 옆에 비율을 같이 보여 무엇이 저장되는지 드러낸다.
 *
 * 기본값은 **진행 중인 매체에 균등** 배분이다 — 끝난 매체에 담아 봐야 태울 수 없다.
 */
export function CarryModal({
  row,
  dests,
  share,
  onClose,
  onSave,
  onClear,
}: {
  row: CarryRow
  dests: CarryRow[]
  /** 지금 저장된 비율 (없으면 처음 여는 것) */
  share: Record<string, number> | undefined
  onClose: () => void
  onSave: (share: Record<string, number>) => void
  onClear: () => void
}) {
  const cap = row.carryCap
  const won = (v: number) => (v ? String(Math.round(v)) : "")

  // 처음 열면 진행 중인 매체에 균등. 이미 지정한 게 있으면 그 비율을 금액으로 되돌린다.
  const [amt, setAmt] = useState<Record<string, string>>(() => {
    if (share) return Object.fromEntries(dests.map((d) => [d.id, won(cap * (share[d.id] || 0))]))
    const tg = defaultTargets(dests)
    const each = tg.length ? Math.round(cap / tg.length) : 0
    return Object.fromEntries(dests.map((d) => [d.id, tg.includes(d) ? String(each) : ""]))
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const num = (t: string) => {
    const s = (t || "").replace(/[,\s]/g, "")
    if (!s) return 0
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const total = dests.reduce((a, d) => a + num(amt[d.id]), 0)
  const over = total > cap
  const pctOf = (v: number) => (cap > 0 ? (v / cap) * 100 : 0)

  const equal = () => {
    const tg = defaultTargets(dests)
    const each = tg.length ? Math.round(cap / tg.length) : 0
    setAmt(Object.fromEntries(dests.map((d) => [d.id, tg.includes(d) ? String(each) : ""])))
  }

  const submit = () => {
    if (total <= 0) return alert("한 라인 이상에 금액을 넣으세요.")
    if (over)
      return alert(`잔여액(${f0(cap)}원)보다 많이 넘길 수는 없습니다. 지금 합계 ${f0(total)}원.`)
    // 금액 → 잔여액 대비 비율로 바꿔 저장한다
    const out: Record<string, number> = {}
    for (const d of dests) {
      const v = num(amt[d.id])
      if (v > 0) out[d.id] = v / cap
    }
    onSave(out)
  }

  const cell = "rounded-[8px] border border-graphite/25 bg-paper px-2 py-1.5 text-right text-[12px] tabular-nums"

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-graphite/25 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-[620px] overflow-auto rounded-[12px] bg-paper shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-graphite/10 px-6 py-4">
          <h2 className="display m-0 text-[22px]">잔여금 이관</h2>
          <p className="m-0 mt-1.5 text-[12px] leading-[1.6] text-fog">
            {row.sol} · {row.ctry} · <b className="font-semibold">{row.phase}</b> · {row.med} ({row.end}{" "}
            종료) 의 잔여금을 <b className="font-semibold">{row.nextPhase}</b> 로 넘깁니다 · 잔여액{" "}
            <b className="font-semibold text-graphite">{f0(cap)}</b>원
          </p>
        </div>

        <div className="px-6 py-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] tracking-[0.06em] text-fog uppercase">
              {row.nextPhase} 라인별 반영 금액
            </span>
            <span className="flex-1" />
            <button type="button" onClick={equal} className={cn(btnGhost, "px-3 py-1 text-[12px]")}>
              균등 배분
            </button>
          </div>

          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-graphite/15 text-[11px] text-fog">
                <th className="py-1.5 text-left font-normal">매체</th>
                <th className="py-1.5 text-left font-normal">종료일</th>
                <th className="py-1.5 text-right font-normal">반영 금액 (KRW)</th>
                <th className="w-[64px] py-1.5 text-right font-normal">비율</th>
              </tr>
            </thead>
            <tbody>
              {dests.map((d) => {
                const v = num(amt[d.id])
                const ended = (d.daysLeft ?? 0) <= 0
                return (
                  <tr key={d.id} className="border-b border-graphite/8">
                    <td className="py-1.5">
                      {d.med}
                      {ended ? (
                        <span
                          className="ml-1.5 text-[11px] text-fog"
                          title="이미 끝난 매체라 넣어도 태울 수 없습니다"
                        >
                          종료
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-fog">{d.end}</td>
                    <td className="py-1.5 text-right">
                      <input
                        value={amt[d.id] ?? ""}
                        onChange={(e) => setAmt((p) => ({ ...p, [d.id]: e.target.value }))}
                        placeholder="0"
                        className={cn(cell, "w-[150px]", v > 0 && "border-graphite/50 bg-amber")}
                      />
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-fog">
                      {v > 0 ? `${f2(pctOf(v))}%` : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-graphite">
                <td className="py-2 font-semibold" colSpan={2}>
                  합계
                </td>
                <td className={cn("py-2 text-right font-semibold tabular-nums", over && "tint tint-neg")}>
                  {f0(total)}
                </td>
                <td className="py-2 text-right tabular-nums font-semibold">{f2(pctOf(total))}%</td>
              </tr>
              <tr>
                <td className="py-1 text-[11.5px] text-fog" colSpan={2}>
                  남는 잔여액
                </td>
                <td className="py-1 text-right text-[11.5px] tabular-nums text-fog" colSpan={2}>
                  {f0(Math.max(cap - total, 0))}원
                </td>
              </tr>
            </tfoot>
          </table>

          {over ? (
            <p className="mt-3 rounded-[10px] bg-blush px-4 py-2.5 text-[11.5px]">
              합계가 잔여액을 <b className="font-semibold">{f0(total - cap)}원</b> 넘습니다. 잔여액
              안에서 나눠 주세요.
            </p>
          ) : null}

          <p className="mt-3 rounded-[10px] bg-cream px-4 py-2.5 text-[11.5px] leading-[1.6] text-fog">
            저장되는 건 금액이 아니라 <b className="font-semibold text-graphite">잔여액 대비 비율</b>
            입니다. 환율이 갱신되면 소진 KRW 가 달라져 잔여액도 움직이는데, 금액을 굳혀 두면 그때부터
            배분 합이 어긋납니다. 비율로 두면 지정한 배분이 그대로 따라갑니다 ·{" "}
            <b className="font-semibold text-graphite">화면 계산</b>이라 서버에 저장되지 않습니다.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={submit} className={btnFilled}>
              이관 적용
            </button>
            <button type="button" onClick={onClose} className={btnGhost}>
              닫기
            </button>
            <span className="flex-1" />
            {share ? (
              <button
                type="button"
                onClick={onClear}
                className="pill cursor-pointer px-4 py-2 text-[13px] text-fog hover:bg-cream"
              >
                이관 취소
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
