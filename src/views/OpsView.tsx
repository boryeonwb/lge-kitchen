/**
 * 월별 값 한 칸 — 출처를 굵기·색으로 드러낸다.
 * 확정(인보이스)만 실적이고, 수기는 매체 리포트 기준 실적, 계획은 아직 실적이 아니다.
 * 숫자만 보여주면 광고주가 계획값을 실적으로 읽는다.
 */
function SrcValue({ src, mon, text }: { src?: string; mon: string; text: string }) {
  if (src === "확정")
    return (
      <b className="text-[11.5px]" title={`${mon}월 인보이스로 확정된 금액입니다`}>
        {text}
      </b>
    )
  if (src === "수기")
    return (
      <span
        className="tint tint-info text-[11.5px]"
        title={`${mon}월 매체 리포트 기준으로 사람이 넣은 값 (인보이스 확정 전)`}
      >
        {text}
      </span>
    )
  if (src === "시트")
    return (
      <span
        className="tint tint-ok text-[11.5px]"
        title={`${mon}월 Criteo 실시간 소진 시트 — 인보이스도 수기값도 없어 시트로 메웠습니다 (그 달 1일~어제, USD 를 SMBS 환율로 환산)`}
      >
        {text}
      </span>
    )
  return (
    <span
      className="text-[11.5px] italic text-fog"
      title={`${mon}월 계획 — 잔여액을 남은 일수에 일할 배분한 금액입니다(실적 아님)`}
    >
      {text}
    </span>
  )
}

import { useEffect, useState } from "react"
import { DataTable, type Col, type TableRow } from "#/components/DataTable"
import {
  FilterSelect,
  Hint,
  MultiFilterSelect,
  Spacer,
  Toolbar,
  pickSet,
} from "#/components/ui"
import type { OpsPayload } from "#/lib/api"
import { applyCarry, moved, type CarryRow } from "#/lib/carry"
import { useView } from "#/lib/view"
import { f0, f2 } from "#/lib/format"
import { cn } from "#/lib/utils"

/**
 * 운영 탭 — 품의예산 대비 잔여금과, 남은 기간에 태울 세팅 예산.
 *
 *   품의예산(USD) ─품의환율(솔루션×국가)→ 품의예산(KRW) = 집행 상한
 *   실소진 = 확정(인보이스) + 수기 + Criteo 실시간 시트  ← 계획값은 실적이 아니라 뺀다
 *   (품의예산 KRW − 실소진 KRW) ÷ 환율 ÷ 잔여일 = 세팅 일예산  ← Criteo 만
 *
 * 월별 소진은 표에서 접고(총 소진액 두 열) 행을 누르면 아래로 펼친다 — 1~12월 × 두 열이면
 * 스물네 칸이라, 가로로 훑느라 정작 앞쪽 예산·잔여를 못 본다.
 */

/** Phase 구분값이 없는 행. 드롭다운에서 '전체'와 구분되도록 라벨 자체를 값으로 쓴다 */
const PH_BLANK = "(구분없음)"

const BASE_COLS: Col<CarryRow>[] = [
  {
    k: "sol",
    l: "솔루션",
    w: 78,
    // 품의 초과집행 행은 솔루션 칸에 표시를 남긴다
    fmt: (v, r) => (r.over ? <b className="font-semibold">{v} ⚠</b> : v),
    csv: (v) => v,
  },
  {
    k: "ctry",
    l: "국가",
    w: 84,
    // 한글명을 같이 쓰면 열이 그만큼 넓어진다 → 툴팁으로 뺀다.
    // 폭이 고정이라 긴 이름은 잘리므로 전체 이름도 툴팁에 함께 담는다.
    fmt: (v, r) => (
      <span title={r.ctryKor && r.ctryKor !== v ? `${v} (${r.ctryKor})` : v}>{v}</span>
    ),
    csv: (v) => v,
  },
  { k: "phase", l: "PHASE", w: 50, cls: "text-center" },
  { k: "med", l: "매체", w: 76 },
  // 기간은 한 해 안에 들어 있어 월-일만 낸다 — 열을 좁혀야 가로 스크롤이 안 생긴다.
  // 연도는 툴팁에 남기고, CSV 에는 전체 날짜가 그대로 나간다.
  {
    k: "start",
    l: "시작일\n(현지)",
    w: 58,
    cls: "text-center",
    fmt: (v) => <span title={v}>{String(v || "").slice(5)}</span>,
    csv: (v) => v,
  },
  {
    k: "end",
    l: "종료일\n(현지)",
    w: 58,
    cls: "text-center",
    // 기간은 각 국가 현지 날짜다 — 잔여일도 그 나라 '오늘' 로 센다
    fmt: (v, r) => (
      <span title={`${v} · 잔여 ${r.daysLeft ?? "-"}일 (현지 기준)`}>
        {String(v || "").slice(5)}
      </span>
    ),
    csv: (v) => v,
  },
  { k: "budgetUsd", l: "품의\n(USD)", w: 78, cls: "text-right", fmt: f2, csv: f2 },
  {
    k: "budgetKrw",
    l: "품의\n(KRW)",
    w: 90,
    cls: "text-right",
    fmt: (v) => <b>{f0(v)}</b>,
    csv: f0,
  },
  {
    k: "budgetFx",
    l: "품의\n환율",
    w: 58,
    cls: "text-right",
    fmt: (v) => (v ? f2(v) : <span className="text-[11px] text-fog">미입력</span>),
    csv: (v) => (v ? f2(v) : "미입력"),
  },
  {
    // 이관을 반영한 값을 읽는다 — 토글이 꺼져 있으면 서버가 준 값이 그대로 들어 있다
    k: "setLifeAdj",
    l: "세팅\n총예산",
    w: 88,
    cls: "text-right",
    // 매체 캠페인의 총예산 칸에 넣을 값 — 이미 태운 몫을 빼고 넣으면 일찍 멈춘다
    fmt: (v, r) =>
      v === null ? (
        ""
      ) : (
        <b
          className={cn(moved(r) ? "tint tint-info" : r.over ? "tint tint-neg" : "font-semibold")}
          title={
            `이미 정해진 몫 + 앞으로 태울 몫 = ${f2(v)} ${r.setCur}` +
            (r.carryIn > 0
              ? ` · ${r.carryFrom} 종료 잔여금 ${f0(r.carryIn)}원을 이관받아 늘어난 금액입니다`
              : "") +
            (r.carryOut > 0 ? ` · 잔여금을 ${r.carryTo} 로 넘겨 0 이 됐습니다` : "")
          }
        >
          {f2(v)}
        </b>
      ),
    csv: f2,
  },
  {
    // 일예산은 Criteo 에만 낸다 — 실시간 소진을 끌어올 수 있는 매체가 Criteo 뿐이라
    // 다른 매체는 계획값 기반이 되고, 계획값으로 만든 일예산은 매체에 넣으면 안 된다.
    k: "setDailyAdj",
    l: "세팅\n일예산",
    w: 88,
    cls: "text-right",
    fmt: (v, r) => {
      if (r.med !== "criteo")
        return (
          <span className="text-[11px] text-fog" title="Criteo 외 매체는 일예산을 내지 않습니다">
            —
          </span>
        )
      if (v === null)
        return (
          <span className="text-[11px] text-fog">
            {r.daysLeft === 0 ? "종료" : r.budgetKrw === null ? "품의환율 미입력" : ""}
          </span>
        )
      return (
        <b
          className={cn("font-semibold", moved(r) && "tint tint-info")}
          title={
            `(품의예산 ${f0(r.budgetKrw)} − 실소진 ${f0(r.spentEffKrw)}` +
            (r.carryIn ? ` + 이관 ${f0(r.carryIn)}` : "") +
            (r.carryOut ? ` − 이관 ${f0(r.carryOut)}` : "") +
            `) ÷ ${f2(r.setRate ?? 0)} ÷ 잔여 ${r.daysLeft}일`
          }
        >
          {f2(v)}
        </b>
      )
    },
    csv: f2,
  },
  // 오른쪽 월별 원통화 칸이 모두 이 통화다 → 고정 영역 끝에 둔다
  { k: "setCur", l: "세팅\n통화", w: 44, cls: "text-center" },
  {
    k: "leftAdj",
    l: "잔여액\n(KRW)",
    w: 90,
    cls: "text-right",
    // 아직 어느 달에도 배분되지 않은 돈. 종료됐는데 남아 있으면 그만큼 못 쓰고 끝난 것이다.
    // 다음 차수로 넘긴 돈은 못 쓴 게 아니므로 ⚠ 가 자연히 사라진다(잔여액이 0 이 된다).
    fmt: (v, r) => {
      if (v === null) return ""
      const stuck = v > 0 && r.daysLeft === 0
      return (
        <b
          className={v < 0 ? "tint tint-neg" : stuck ? "tint tint-warn" : "font-semibold"}
          title={
            "품의예산(KRW) − 확정 소진 − 수기 입력" +
            (r.carryIn > 0 ? ` + ${r.carryFrom} 에서 이관 ${f0(r.carryIn)}원` : "") +
            (r.carryOut > 0 ? ` · ${f0(r.carryOut)}원을 ${r.carryTo} 로 넘겼습니다` : "") +
            (stuck ? " · 종료됐는데 남아 있어 이만큼 못 쓰고 끝났습니다" : "")
          }
        >
          {f0(v)}
          {stuck ? " ⚠" : ""}
        </b>
      )
    },
    csv: f0,
  },
]

/**
 * 총 소진액 두 열 — 1~12월 × 두 열(스물네 칸)을 접은 자리.
 * 달별 내역은 행을 눌러 아래로 펼친다.
 */
const TOTAL_COLS: Col<CarryRow>[] = [
  {
    k: "natTotal",
    l: "소진액\n(통화)",
    w: 86,
    cls: "text-right",
    // 계획(자동기입)은 실적이 아니므로 빼고 더한 값이다
    fmt: (v) => (v ? <span title="확정 + 수기 + 시트 · 계획은 제외">{f2(v)}</span> : ""),
    csv: f2,
  },
  {
    k: "spentEffKrw",
    l: "소진액\n(KRW)",
    w: 90,
    cls: "text-right",
    fmt: (v, r) => {
      if (!v) return ""
      // 시트가 인보이스와 크게 어긋나는 라인은 시트로 메운 달도 믿기 어렵다
      const odd = !!r.sheetRatio && (r.sheetRatio < 0.75 || r.sheetRatio > 1.35)
      return (
        <b
          className={cn("font-semibold", odd && "tint tint-warn")}
          title={
            "확정(인보이스) + 수기 + 시트 · 계획은 뺀 값" +
            (r.sheetKrw ? ` · 그중 시트 ${f0(r.sheetKrw)}원` : "") +
            (odd
              ? ` · ⚠ 인보이스가 있는 달에서 시트가 ${Math.round((r.sheetRatio || 0) * 100)}% 라, 시트로 메운 달을 그대로 믿기 어렵습니다`
              : "")
          }
        >
          {f0(v)}
          {odd ? " ⚠" : ""}
        </b>
      )
    },
    csv: f0,
  },
]

/** 이관 선택 체크박스 — 끝났고, 남았고, 넘길 다음 차수가 있는 행에만 나온다 */
const CHECK_COL = (picked: Set<string>, toggle: (id: string) => void): Col<CarryRow> => ({
  k: "canCarry",
  l: "이관",
  w: 28,
  cls: "text-center",
  nosort: true,
  fmt: (_v, r) =>
    r.canCarry ? (
      <input
        type="checkbox"
        checked={picked.has(r.id)}
        // 행 클릭(월별 펼치기)까지 같이 걸리지 않게 막는다
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggle(r.id)}
        title={`이 잔여금을 ${r.nextPhase} 로 넘깁니다`}
      />
    ) : (
      ""
    ),
  csv: (_v, r) => (r.canCarry && picked.has(r.id) ? "이관" : ""),
})

/**
 * 잔여금 이관 열 — 어느 차수에서 나가 어느 차수로 들어왔는지.
 */
/**
 * 잔여금 이관 열 — 받은 것(↙)과 넘긴 것(↗)을 따로 낸다.
 *
 * 고른 행은 넘길 금액을 **수기로 고칠 수 있다**. 전액이 아니라 일부만 넘기는 경우가
 * 있어서다. 비우면 다시 전액이 되고, 잔여액보다 큰 값은 잔여액에서 잘린다.
 * 가운데 차수는 받고 다시 넘기므로 두 줄이 같이 나온다 — 하나만 내면 "받았는데
 * 잔여액이 왜 0이지" 로 읽힌다.
 */
const CARRY_COL = (
  amounts: Map<string, number>,
  setAmount: (id: string, v: number | undefined) => void,
): Col<CarryRow> => ({
  k: "carryOut",
  l: "이관\n(KRW)",
  w: 100,
  cls: "text-right",
  nosort: true,
  fmt: (_v, r) => (
    <>
      {r.carryIn > 0 ? (
        <span
          className="tint tint-info block"
          title={`${r.carryFrom} 의 종료 잔여금을 나눠 받았습니다`}
        >
          ↙ +{f0(r.carryIn)}
        </span>
      ) : null}
      {r.canCarry && r.carryOut >= 0 && r.carryTo ? (
        <CarryInput r={r} amounts={amounts} setAmount={setAmount} />
      ) : r.carryOut > 0 ? (
        <span className="block text-fog" title={`${r.carryTo} 로 넘겼습니다`}>
          ↗ −{f0(r.carryOut)}
        </span>
      ) : null}
    </>
  ),
  csv: (_v, r) =>
    [r.carryIn > 0 ? `+${r.carryIn}` : "", r.carryOut > 0 ? `-${r.carryOut}` : ""]
      .filter(Boolean)
      .join(" "),
})

/** 넘길 금액 입력칸 — 기본값은 잔여액 전액이고, 벗어나면 그때 반영한다 */
function CarryInput({
  r,
  amounts,
  setAmount,
}: {
  r: CarryRow
  amounts: Map<string, number>
  setAmount: (id: string, v: number | undefined) => void
}) {
  const man = amounts.get(r.id)
  const [v, setV] = useState(man === undefined ? "" : String(man))
  useEffect(() => setV(man === undefined ? "" : String(man)), [man])

  const commit = () => {
    const t = v.replace(/[,\s]/g, "")
    if (!t) return setAmount(r.id, undefined)
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0) return setV(man === undefined ? "" : String(man))
    setAmount(r.id, Math.round(n))
  }

  return (
    <input
      value={v}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") setV(man === undefined ? "" : String(man))
      }}
      placeholder={f0(r.carryCap)}
      title={
        `${r.carryTo} 로 넘길 금액. 비우면 잔여액 전액(${f0(r.carryCap)}원)을 넘깁니다. ` +
        `잔여액보다 큰 값은 잔여액에서 잘립니다`
      }
      className={cn(
        "w-full rounded-[8px] border px-1.5 py-px text-right text-[11.5px] tabular-nums",
        v ? "border-graphite/45 bg-amber font-semibold" : "border-graphite/20 bg-paper",
      )}
    />
  )
}


export function OpsView({ D }: { D: OpsPayload }) {
  const { filt, setFilt } = useView()
  const onlyLive = filt.opsLive === "1"

  // 넘길 라인은 사람이 고른다. 체크 상태는 이 화면이 들고 있고 서버에 쓰지 않는다.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // 넘길 금액을 수기로 고친 행 (id → KRW). 비우면 잔여액 전액을 넘긴다.
  const [amounts, setAmounts] = useState<Map<string, number>>(new Map())
  const setAmount = (id: string, v: number | undefined) =>
    setAmounts((p) => {
      const n = new Map(p)
      if (v === undefined) n.delete(id)
      else n.set(id, v)
      return n
    })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleRow = (id: string) =>
    setOpen((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // 이관은 **전체 행**으로 계산한다 — 드롭다운으로 앞 차수를 걸러낸 상태에서 계산하면
  // 넘겨줄 차수가 화면에서 사라졌다는 이유로 이관액이 달라진다.
  const carry = applyCarry(D.rows, picked, amounts)

  // 드롭다운은 앞 선택을 따라 좁아진다 — 솔루션을 고르면 그 솔루션에 있는 국가만 남는다
  const pool = carry.rows.filter((r) => !onlyLive || (r.daysLeft ?? 0) > 0)
  const sols = [...new Set(pool.map((r) => r.sol))].sort()
  const vSol = sols.includes(filt.opsSol) ? filt.opsSol : ""
  const spool = pool.filter((r) => !vSol || r.sol === vSol)

  const ctrys = [...new Set(spool.map((r) => r.ctry))].sort((a, b) => a.localeCompare(b, "ko"))
  const vCtry = ctrys.includes(filt.opsCtry) ? filt.opsCtry : ""
  const cpool = spool.filter((r) => !vCtry || r.ctry === vCtry)

  const phases = [...new Set(cpool.map((r) => r.phase || PH_BLANK))].sort((a, b) =>
    a === PH_BLANK ? 1 : b === PH_BLANK ? -1 : a.localeCompare(b, "ko"),
  )
  const vPh = phases.includes(filt.opsPhase) ? filt.opsPhase : ""
  const ppool = cpool.filter((r) => !vPh || (r.phase || PH_BLANK) === vPh)

  const meds = [...new Set(ppool.map((r) => r.med))].sort()
  const medSel = pickSet(filt.opsMed, meds)
  const rows = ppool.filter((r) => !medSel.size || medSel.has(r.med))

  const sum = (k: "budgetUsd" | "budgetKrw" | "leftAdj" | "spentEffKrw") =>
    rows.reduce((a, r) => a + (r[k] || 0), 0)
  const gBud = sum("budgetKrw")
  const gLeft = sum("leftAdj")
  const gSpent = sum("spentEffKrw")

  const cols = [
    CHECK_COL(picked, togglePick),
    ...BASE_COLS,
    CARRY_COL(amounts, setAmount),
    ...TOTAL_COLS,
  ]
  const total: TableRow = {
    __type: "grand",
    sol: "합계",
    budgetUsd: f2(sum("budgetUsd")),
    budgetKrw: f0(gBud),
    leftAdj: f0(gLeft),
    spentEffKrw: f0(gSpent),
  }

  return (
    <>
      <Toolbar>
        <FilterSelect fkey="opsSol" label="솔루션" values={sols} />
        <FilterSelect
          fkey="opsCtry"
          label="국가"
          values={ctrys}
          display={(v) => {
            const r = spool.find((x) => x.ctry === v)
            return r?.ctryKor && r.ctryKor !== v ? `${v} (${r.ctryKor})` : v
          }}
        />
        <FilterSelect fkey="opsPhase" label="PHASE" values={phases} />
        <MultiFilterSelect fkey="opsMed" label="매체" values={meds} />
        <label className="pill flex cursor-pointer items-center gap-2 border border-graphite/15 bg-paper px-4 py-2 text-[13px]">
          <input
            type="checkbox"
            checked={onlyLive}
            onChange={(e) => setFilt("opsLive", e.target.checked ? "1" : "")}
          />
          진행 중만 (잔여일 &gt; 0)
        </label>

        {/* 지금 화면에 보이는 것 중 고를 수 있는 행을 한 번에 켜고 끈다 */}
        <button
          type="button"
          disabled={!rows.some((r) => r.canCarry)}
          onClick={() => {
            const ids = rows.filter((r) => r.canCarry).map((r) => r.id)
            const allOn = ids.every((id) => picked.has(id))
            setPicked((p) => {
              const n = new Set(p)
              for (const id of ids) allOn ? n.delete(id) : n.add(id)
              return n
            })
          }}
          className="pill cursor-pointer whitespace-nowrap border border-graphite/25 px-4 py-2 text-[13px] hover:bg-cream disabled:opacity-40"
          title="지금 필터에 걸린 행 중 이관 가능한 것을 모두 선택/해제합니다"
        >
          보이는 행 이관 선택
        </button>
        {picked.size ? (
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="pill cursor-pointer whitespace-nowrap px-3 py-2 text-[12px] text-fog hover:bg-cream"
          >
            선택 해제 ({picked.size})
          </button>
        ) : null}

        <Spacer />
        <Hint>
          {carry.moves > 0 ? (
            <>
              <span className="tint tint-info">
                이관 {carry.moves}건 · {f0(carry.total)}원
              </span>{" "}
              ·{" "}
            </>
          ) : null}
          {rows.length}행 · 품의 <b>{f0(gBud)}</b> · 실소진 <b>{f0(gSpent)}</b> · 잔여{" "}
          <b className={cn("font-semibold", gLeft < 0 && "tint tint-neg")}>{f0(gLeft)}</b>
        </Hint>
      </Toolbar>

      <div className="mb-3 text-[12px] leading-[1.6] text-fog">
        행을 누르면 아래에 <b className="font-semibold">월별 소진</b>이 펼쳐집니다 · 월별 값은
        한 달에 하나 — <b className="font-semibold">확정</b>(인보이스) &gt;{" "}
        <span className="tint tint-info text-[11.5px]">수기</span> &gt;{" "}
        <span className="tint tint-ok text-[11.5px]">시트</span>(Criteo 실시간, {D.sheet.asOf || "미수집"}까지)
        &gt; <i>계획</i>(실적 아님) · <b className="font-semibold">세팅 일예산은 Criteo 만</b>{" "}
        냅니다 — (품의예산 KRW − 실소진 KRW) ÷ 환율 ÷ 잔여일 · 왼쪽 체크박스로 고른 행의
        잔여금이 <b className="font-semibold">다음 Phase</b> 로 넘어갑니다(화면 계산)
      </div>

      <div className="overflow-hidden rounded-[12px] bg-paper shadow-soft">
        <DataTable
          cols={cols}
          rows={[...rows, total]}
          sortKey="ops"
          freeze={5}
          expanded={open}
          onToggle={toggleRow}
          detailRows={monthRows}
        />
      </div>
    </>
  )
}

/**
 * 펼친 행의 월별 소진 — **같은 열 구조**로 낸다.
 * 월은 시작일 자리에, 금액은 위 행의 소진액 두 열과 같은 자리에 선다. 카드로 빼면
 * 같은 숫자를 눈으로 다시 맞춰야 하지만, 열을 맞추면 그냥 아래로 읽힌다.
 */
function monthRows(row: TableRow): TableRow[] {
  const r = row as CarryRow
  const months = Object.keys(r.monKrw || {}).sort((a, b) => +a - +b)
  return months.map((m) => ({
    __type: "detail" as const,
    start: `${m}월`,
    end: <SrcValue src={r.monSrc[m]} mon={m} text={r.monSrc[m] || "?"} />,
    setCur: r.setCur,
    natTotal: r.monNat[m] !== undefined ? f2(r.monNat[m]) : "",
    spentEffKrw: f0(r.monKrw[m]),
  }))
}
