import { DataTable, type Col, type TableRow } from "#/components/DataTable"
import {
  CountryCell,
  FilterSelect,
  Hint,
  MultiFilterSelect,
  Spacer,
  Toolbar,
  pickSet,
} from "#/components/ui"
import type { OpsPayload, OpsRow } from "#/lib/api"
import { applyCarry, boosted, type CarryRow } from "#/lib/carry"
import { useView } from "#/lib/view"
import { f0, f2 } from "#/lib/format"
import { cn } from "#/lib/utils"

/**
 * 운영 탭 — 품의예산 대비 잔여금과, 남은 기간에 태울 세팅 예산.
 *
 *   품의예산(USD) ─품의환율(솔루션×국가)→ 품의예산(KRW) = 집행 상한
 *   상한 − 확정소진 − 수기입력 = 잔여액 (아직 어느 달에도 배분되지 않은 돈)
 *   잔여액 ÷ 환율 ÷ 잔여일(오늘~종료일) = 세팅 일예산
 *   세팅 총예산 = 이미 정해진 원통화 + 앞으로 태울 원통화
 *
 * 월별 소진 KRW 는 한 달에 하나만 쓰고, 어느 값을 쓸지는 서버가 정해 내려준다:
 *   확정(인보이스) > 수기 입력 > 자동기입(계획). 세팅통화 칸도 같은 출처로 짝을 맞춘다.
 */

/** Phase 구분값이 없는 행. 드롭다운에서 '전체'와 구분되도록 라벨 자체를 값으로 쓴다 */
const PH_BLANK = "(구분없음)"

/**
 * 표에 낼 월 — **전체 행 기준으로** 값이 하나라도 있는 달만 낸다.
 *
 * 집행이 없는 달까지 1~12월을 다 내면 빈 열 여덟 개를 가로로 지나야 첫 숫자를 만난다.
 * 필터된 행이 아니라 전체 행으로 정하므로, 드롭다운을 바꿔도 월 위치는 그대로 고정된다.
 */
const monthsOf = (rows: OpsRow[]) => {
  const seen = new Set<string>()
  for (const r of rows) for (const m of Object.keys(r.monKrw || {})) seen.add(m)
  return [...seen].sort((a, b) => +a - +b)
}

const BASE_COLS: Col<CarryRow>[] = [
  {
    k: "sol",
    l: "솔루션",
    w: 92,
    // 품의 초과집행 행은 솔루션 칸에 표시를 남긴다
    fmt: (v, r) => (r.over ? <b className="font-semibold">{v} ⚠</b> : v),
    csv: (v) => v,
  },
  {
    k: "ctry",
    l: "국가",
    w: 104,
    fmt: (v, r) => <CountryCell ctry={v} kor={r.ctryKor} />,
    csv: (v) => v,
  },
  { k: "phase", l: "PHASE", w: 66, cls: "text-center" },
  { k: "med", l: "매체", w: 78 },
  { k: "start", l: "시작일\n(현지)", w: 92, cls: "text-center", csv: (v) => v },
  {
    k: "end",
    l: "종료일\n(현지)",
    w: 92,
    cls: "text-center",
    // 기간은 각 국가 현지 날짜다 — 잔여일도 그 나라 '오늘' 로 센다
    fmt: (v, r) => <span title={`잔여 ${r.daysLeft ?? "-"}일 (현지 기준)`}>{v}</span>,
    csv: (v) => v,
  },
  { k: "budgetUsd", l: "품의예산\n(USD)", w: 104, cls: "text-right", fmt: f2, csv: f2 },
  {
    k: "budgetKrw",
    l: "품의예산\n(KRW)",
    w: 120,
    cls: "text-right",
    fmt: (v) => <b>{f0(v)}</b>,
    csv: f0,
  },
  {
    k: "budgetFx",
    l: "품의환율",
    w: 80,
    cls: "text-right",
    fmt: (v) => (v ? f2(v) : <span className="text-[11px] text-fog">미입력</span>),
    csv: (v) => (v ? f2(v) : "미입력"),
  },
  {
    // 이관을 반영한 값을 읽는다 — 토글이 꺼져 있으면 서버가 준 값이 그대로 들어 있다
    k: "setLifeAdj",
    l: "세팅 총예산\n(세팅통화)",
    w: 126,
    cls: "text-right",
    // 매체 캠페인의 총예산 칸에 넣을 값 — 이미 태운 몫을 빼고 넣으면 일찍 멈춘다
    fmt: (v, r) =>
      v === null ? (
        ""
      ) : (
        <b
          className={cn(boosted(r) ? "tint tint-info" : r.over ? "tint tint-neg" : "font-semibold")}
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
    k: "setDailyAdj",
    l: "세팅 일예산\n(세팅통화)",
    w: 120,
    cls: "text-right",
    fmt: (v, r) =>
      v === null ? (
        <span className="text-[11px] text-fog">{r.daysLeft === 0 ? "종료" : ""}</span>
      ) : (
        <b
          className={cn("font-semibold", boosted(r) && "tint tint-info")}
          title={
            `잔여액 ÷ 환율 ÷ 잔여 ${r.daysLeft}일(오늘~종료일)` +
            (r.carryIn > 0 ? ` · ${r.carryFrom} 에서 이관받은 ${f0(r.carryIn)}원이 들어 있습니다` : "")
          }
        >
          {f2(v)}
        </b>
      ),
    csv: f2,
  },
  // 오른쪽 월별 원통화 칸이 모두 이 통화다 → 고정 영역 끝에 둔다
  { k: "setCur", l: "세팅\n통화", w: 66, cls: "text-center" },
  {
    k: "leftAdj",
    l: "잔여액\n(KRW)",
    w: 120,
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
 * 잔여금 이관 열 — 토글을 켰을 때만 잔여액 오른쪽에 붙는다.
 * 어느 차수에서 나가 어느 차수로 들어왔는지가 이 화면의 핵심이라 별도 열로 낸다.
 */
const CARRY_COL: Col<CarryRow> = {
  k: "carryIn",
  l: "잔여금\n이관(KRW)",
  w: 132,
  cls: "text-right",
  nosort: true,
  // 한 행이 받고 다시 넘기는 경우가 있다(가운데 차수). 둘 중 하나만 보이면
  // "받았는데 잔여액이 왜 0이지" 로 읽히므로 두 줄로 다 낸다.
  fmt: (_v, r) => (
    <>
      {r.carryIn > 0 ? (
        <span
          className="tint tint-info block"
          title={`${r.carryFrom} 의 종료 잔여금을 넘겨받았습니다`}
        >
          ↙ +{f0(r.carryIn)}
        </span>
      ) : null}
      {r.carryOut > 0 ? (
        <span
          className="block text-fog"
          title={`이 차수가 끝나 남은 금액을 ${r.carryTo} 로 넘겼습니다`}
        >
          ↗ −{f0(r.carryOut)}
        </span>
      ) : null}
    </>
  ),
  csv: (_v, r) =>
    [r.carryIn > 0 ? `+${r.carryIn}` : "", r.carryOut > 0 ? `-${r.carryOut}` : ""]
      .filter(Boolean)
      .join(" "),
}

/** 월별 소진 — 월마다 (세팅통화, KRW) 두 열 */
const monCols = (months: string[]): Col<CarryRow>[] =>
  months.flatMap((m): Col<CarryRow>[] => [
    {
      k: "monNat",
      id: `natM${m}`,
      l: `${m}월 소진\n(세팅통화)`,
      w: 118,
      cls: "text-right",
      nosort: true,
      fmt: (_v, r) => {
        const v = r.monNat?.[m]
        if (v === undefined) return ""
        return <SrcValue src={r.monSrc?.[m]} mon={m} text={f2(v)} cur={r.setCur} />
      },
      csv: (_v, r) => (r.monNat?.[m] === undefined ? "" : String(r.monNat[m])),
    },
    {
      k: "monKrw",
      id: `krwM${m}`,
      l: `${m}월 소진\n(KRW)`,
      w: 114,
      cls: "text-right",
      nosort: true,
      fmt: (_v, r) => {
        const v = r.monKrw?.[m]
        if (v === undefined) return ""
        return <SrcValue src={r.monSrc?.[m]} mon={m} text={f0(v)} />
      },
      csv: (_v, r) => {
        const v = r.monKrw?.[m]
        if (v === undefined) return ""
        const s = r.monSrc?.[m]
        return s === "확정" ? String(v) : `(${s})${v}`
      },
    },
  ])

/**
 * 월별 값 한 칸 — 출처를 굵기·색으로 드러낸다.
 * 확정(인보이스)만 실적이고, 수기는 매체 리포트 기준 실적, 계획은 아직 실적이 아니다.
 * 숫자만 보여주면 광고주가 계획값을 실적으로 읽는다.
 */
function SrcValue({
  src,
  mon,
  text,
  cur,
}: {
  src?: string
  mon: string
  text: string
  cur?: string
}) {
  const unit = cur ? ` ${cur}` : "원"
  if (src === "확정")
    return <b title={`${mon}월 인보이스 확정${unit ? ` · ${unit.trim()}` : ""}`}>{text}</b>
  if (src === "수기")
    return (
      <span
        className="tint tint-info"
        title={`${mon}월 매체 리포트 기준 집행액 (인보이스 확정 전)`}
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

export function OpsView({ D }: { D: OpsPayload }) {
  const { filt, setFilt } = useView()
  const onlyLive = filt.opsLive === "1"
  const carryOn = filt.opsCarry === "1"

  // 이관은 **전체 행**으로 계산한다 — 드롭다운으로 앞 차수를 걸러낸 상태에서 계산하면
  // 넘겨줄 차수가 화면에서 사라졌다는 이유로 이관액이 달라진다.
  const carry = applyCarry(D.rows, carryOn)

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

  const sum = (k: "budgetUsd" | "budgetKrw" | "leftAdj") =>
    rows.reduce((a, r) => a + (r[k] || 0), 0)
  const gBud = sum("budgetKrw")
  const gLeft = sum("leftAdj")
  // 월별 칸에 실제로 보이는 값과 같은 우선순위로 더한다 (확정 > 수기 > 계획)
  const months = monthsOf(D.rows)
  const monSum: Record<string, number> = {}
  for (const m of months) {
    const s = rows.reduce((a, r) => a + (r.monKrw?.[m] ?? 0), 0)
    if (s) monSum[m] = s
  }
  const gSpent = Object.values(monSum).reduce((a, v) => a + v, 0)

  // 이관 열은 켰을 때만 낸다 — 늘 비어 있는 열을 고정 영역에 두면 자리만 차지한다
  const cols = carryOn
    ? [...BASE_COLS, CARRY_COL, ...monCols(months)]
    : [...BASE_COLS, ...monCols(months)]
  const total: TableRow = {
    __type: "grand",
    sol: "합계",
    budgetUsd: f2(sum("budgetUsd")),
    budgetKrw: f0(gBud),
    leftAdj: f0(gLeft),
    ...Object.fromEntries(Object.entries(monSum).map(([m, v]) => [`krwM${m}`, f0(v)])),
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

        {/* 잔여금 이관 — 같은 솔루션·국가 안에서 끝난 차수의 잔여금을 다음 차수로 넘긴다.
            화면 계산이라 끄면 서버가 준 원래 숫자로 되돌아간다. */}
        <button
          type="button"
          onClick={() => setFilt("opsCarry", carryOn ? "" : "1")}
          title={
            "같은 솔루션·국가에서 이미 끝난 Phase 의 잔여금을 다음 Phase 로 넘겨, 세팅 총예산·일예산을 다시 계산합니다. " +
            "화면에서만 계산하며 실제 품의·세팅을 바꾸지 않습니다."
          }
          className={cn(
            "pill cursor-pointer whitespace-nowrap px-4 py-2 text-[13px]",
            carryOn
              ? "bg-graphite font-semibold text-paper"
              : "border border-graphite/25 hover:bg-cream",
          )}
        >
          잔여금 이관 {carryOn ? "ON" : "OFF"}
        </button>

        <Spacer />
        <Hint>
          {carryOn && carry.moves > 0 ? (
            <>
              <span className="tint tint-info">
                이관 {carry.moves}건 · {f0(carry.total)}원
              </span>{" "}
              ·{" "}
            </>
          ) : null}
          {rows.length}행 · 품의 <b>{f0(gBud)}</b> · 소진 <b>{f0(gSpent)}</b> · 잔여{" "}
          <b className={cn("font-semibold", gLeft < 0 && "tint tint-neg")}>{f0(gLeft)}</b>
        </Hint>
      </Toolbar>

      <div className="overflow-hidden rounded-[12px] bg-paper shadow-soft">
        <DataTable
          cols={cols}
          rows={[...rows, total]}
          sortKey="ops"
          freeze={carryOn ? 14 : 13}
        />
      </div>
    </>
  )
}
