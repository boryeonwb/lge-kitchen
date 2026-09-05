import { useEffect, useState } from "react"
import { f0 } from "#/lib/format"
import { lastEditor, type SettleRowX, type TaxOvEntry } from "#/lib/taxov"
import { btnFilled, btnGhost } from "#/components/ui"
import { cn } from "#/lib/utils"

/**
 * 세금계산서 매체비·수수료 수기 수정.
 *
 * 담당자·사유·처리방안을 **반드시** 받는다 — 금액만 남으면 나중에 왜 고쳤는지 알 수 없고,
 * 그때는 고친 값이 맞는지 확인할 방법도 사라진다. 처리방안은 자유 기재다(WB 손실로 털지,
 * 다음 달에 조정할지 같은 결정을 되짚기 위한 기록).
 *
 * 저장은 이 브라우저에만 남는다. 화면에 그렇게 적어 둔다.
 */
export function TaxOverrideModal({
  row,
  onClose,
  onSave,
  onClear,
}: {
  row: SettleRowX
  onClose: () => void
  onSave: (e: Omit<TaxOvEntry, "at">) => void
  onClear: () => void
}) {
  const num = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : Number(v).toLocaleString("ko-KR")
  const ov = row.ov
  const [media, setMedia] = useState(num(row.billMediaAdj))
  const [fee, setFee] = useState(num(row.billFeeAdj))
  const [by, setBy] = useState(ov?.by || lastEditor())
  const [reason, setReason] = useState(ov?.reason || "")
  const [plan, setPlan] = useState(ov?.plan || "")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // 세금계산서는 원 단위로 발행한다 → 입력값도 반올림해 미리보기와 저장값을 맞춘다
  const toNum = (t: string) => {
    const s = t.replace(/,/g, "").trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? Math.round(n) : NaN
  }
  const mediaN = toNum(media)
  const feeN = toNum(fee)
  const bad = Number.isNaN(mediaN) || Number.isNaN(feeN)

  const mediaEff = (Number.isNaN(mediaN) ? null : mediaN) ?? row.billMedia ?? 0
  const feeEff = (Number.isNaN(feeN) ? null : feeN) ?? row.billFee ?? 0
  // HSAD 는 매체비를 광고주가 매체에 직접 지불 → 발행 금액은 수수료만
  const totalEff = row.owner === "HSAD" ? feeEff : mediaEff + feeEff

  const submit = () => {
    if (bad) return alert("매체비와 수수료는 숫자로 입력하세요.")
    if (mediaN === null && feeN === null)
      return alert("매체비 또는 수수료 중 하나는 입력하세요.\n(원래대로 되돌리려면 [수정 취소])")
    if (!by.trim() || !reason.trim() || !plan.trim())
      return alert("담당자·사유·처리방안을 모두 입력해야 저장됩니다.")
    onSave({ media: mediaN, fee: feeN, by: by.trim(), reason: reason.trim(), plan: plan.trim() })
  }

  const field = "w-full rounded-[10px] border border-graphite/25 bg-paper px-3 py-2 text-[13px]"
  const label = "mb-1 block text-[11px] tracking-[0.06em] text-fog uppercase"
  const hist = ov ? [ov, ...ov.history] : []
  const srv = row.srvOv ? [row.srvOv, ...row.srvOv.history] : []

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-graphite/25 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-[560px] overflow-auto rounded-[12px] bg-paper shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-graphite/10 px-6 py-4">
          <h2 className="display m-0 text-[22px]">세금계산서 금액 수정</h2>
          <p className="m-0 mt-1.5 text-[12px] leading-[1.6] text-fog">
            {row.sol} · {row.ctry} · {row.phase || "(구분없음)"} · {row.med} ·{" "}
            {+row.mon.slice(5, 7)}월 · 처리주체 <b className="font-semibold">{row.owner}</b>
            {row.owner === "HSAD" ? " (매체비는 광고주가 매체에 직접 지불 → 수수료만 발행)" : ""}
          </p>
        </div>

        <div className="px-6 py-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <span className={label}>청구 매체비 (KRW)</span>
              <input
                autoFocus
                value={media}
                onChange={(e) => setMedia(e.target.value)}
                placeholder={num(row.billMedia) || "자동값 없음"}
                className={cn(field, "text-right tabular-nums")}
              />
              <span className="mt-1 block text-[11px] text-fog">자동 {num(row.billMedia)}</span>
            </div>
            <div>
              <span className={label}>청구 수수료 (KRW)</span>
              <input
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder={num(row.billFee) || "자동값 없음"}
                className={cn(field, "text-right tabular-nums")}
              />
              <span className="mt-1 block text-[11px] text-fog">자동 {num(row.billFee)}</span>
            </div>
          </div>

          <div className="mb-4 rounded-[10px] bg-cream px-4 py-3 text-[13px]">
            최종 세금계산서 발행 금액{" "}
            <b className="ml-1 text-[15px] tabular-nums">{f0(totalEff)}</b> 원
            <span className="ml-2 text-[11.5px] text-fog">
              {row.owner === "HSAD" ? "= 수수료" : "= 매체비 + 수수료"} · 자동값{" "}
              {f0(row.taxKrw)}원
            </span>
          </div>

          <div className="mb-3">
            <span className={label}>담당자 *</span>
            <input value={by} onChange={(e) => setBy(e.target.value)} className={field} />
          </div>
          <div className="mb-3">
            <span className={label}>수정 사유 *</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 매체 크레딧 반영으로 매체비 감액"
              className={field}
            />
          </div>
          <div className="mb-4">
            <span className={label}>처리방안 *</span>
            <input
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="예: WB 손실 처리 / 다음 달 정산에서 조정 / 매체에 크레딧 요청"
              className={field}
            />
            <span className="mt-1 block text-[11px] text-fog">
              차액을 어떻게 끝낼지 — 나중에 되짚기 위한 기록이라 자유롭게 적으면 됩니다
            </span>
          </div>

          {srv.length ? (
            <details open className="mb-3 rounded-[10px] border border-graphite/12 bg-cream">
              <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold">
                내부 대시보드 수정 이력 {srv.length}건
                <span className="font-normal text-fog"> · 공유되는 기록이며 위 자동값에 이미 반영돼 있습니다</span>
              </summary>
              <div className="px-3 pb-3">
                {srv.map((h, i) => (
                  <div key={i} className="border-t border-graphite/10 py-2 text-[11.5px] text-fog">
                    <b className="font-semibold text-graphite">
                      {h.media !== null ? `매체비 ${f0(h.media)}` : ""}
                      {h.media !== null && h.fee !== null ? " · " : ""}
                      {h.fee !== null ? `수수료 ${f0(h.fee)}` : ""}
                    </b>
                    <br />
                    {h.by} · {h.reason} · {h.at}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {hist.length ? (
            <details className="mb-4 rounded-[10px] border border-graphite/12">
              <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold">
                이 화면에서 고친 이력 {hist.length}건
              </summary>
              <div className="px-3 pb-3">
                {hist.map((h, i) => (
                  <div key={i} className="border-t border-graphite/10 py-2 text-[11.5px] text-fog">
                    <b className="font-semibold text-graphite">
                      {h.media !== null ? `매체비 ${f0(h.media)}` : ""}
                      {h.media !== null && h.fee !== null ? " · " : ""}
                      {h.fee !== null ? `수수료 ${f0(h.fee)}` : ""}
                    </b>
                    <br />
                    {h.by} · {h.reason} · 처리방안 {h.plan} · {h.at}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <p className="mb-4 rounded-[10px] bg-amber px-4 py-2.5 text-[11.5px] leading-[1.6]">
            이 수정은 <b className="font-semibold">이 대시보드(이 브라우저)에만</b> 반영됩니다.
            내부 정산 대시보드의 금액은 바뀌지 않습니다.
          </p>

          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} className={btnFilled}>
              저장
            </button>
            <button type="button" onClick={onClose} className={btnGhost}>
              닫기
            </button>
            <span className="flex-1" />
            {ov ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm("수기 수정을 지우고 자동 계산값으로 되돌립니다. 계속할까요?")) onClear()
                }}
                className="pill cursor-pointer px-4 py-2 text-[13px] text-fog hover:bg-cream"
              >
                수정 취소
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
