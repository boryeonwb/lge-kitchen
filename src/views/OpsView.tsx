import { DataTable, type Col, type TableRow } from "#/components/DataTable"
import {
  Card,
  CountryCell,
  FilterSelect,
  Hint,
  KpiCards,
  MultiFilterSelect,
  Spacer,
  Toolbar,
  pickSet,
} from "#/components/ui"
import type { OpsPayload, OpsRow } from "#/lib/api"
import { useView } from "#/lib/view"
import { MONLBL, eok, f0, f2 } from "#/lib/format"
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

const BASE_COLS: Col<OpsRow>[] = [
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
    k: "setLife",
    l: "세팅 총예산\n(세팅통화)",
    w: 126,
    cls: "text-right",
    // 매체 캠페인의 총예산 칸에 넣을 값 — 이미 태운 몫을 빼고 넣으면 일찍 멈춘다
    fmt: (v, r) =>
      v === null ? (
        ""
      ) : (
        <b
          className={r.over ? "tint tint-neg" : "font-semibold"}
          title={`이미 정해진 몫 + 앞으로 태울 몫 = ${f2(v)} ${r.setCur}`}
        >
          {f2(v)}
        </b>
      ),
    csv: f2,
  },
  {
    k: "setDaily",
    l: "세팅 일예산\n(세팅통화)",
    w: 120,
    cls: "text-right",
    fmt: (v, r) =>
      v === null ? (
        <span className="text-[11px] text-fog">{r.daysLeft === 0 ? "종료" : ""}</span>
      ) : (
        <b className="font-semibold" title={`잔여액 ÷ 환율 ÷ 잔여 ${r.daysLeft}일(오늘~종료일)`}>
          {f2(v)}
        </b>
      ),
    csv: f2,
  },
  // 오른쪽 월별 원통화 칸이 모두 이 통화다 → 고정 영역 끝에 둔다
  { k: "setCur", l: "세팅\n통화", w: 66, cls: "text-center" },
  {
    k: "leftKrw",
    l: "잔여액\n(KRW)",
    w: 120,
    cls: "text-right",
    // 아직 어느 달에도 배분되지 않은 돈. 종료됐는데 남아 있으면 그만큼 못 쓰고 끝난 것이다
    fmt: (v, r) => {
      if (v === null) return ""
      const stuck = v > 0 && r.daysLeft === 0
      return (
        <b
          className={v < 0 ? "tint tint-neg" : stuck ? "tint tint-warn" : "font-semibold"}
          title={
            "품의예산(KRW) − 확정 소진 − 수기 입력" +
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

/** 월별 소진 — 월마다 (세팅통화, KRW) 두 열 */
const monCols = (months: string[]): Col<OpsRow>[] =>
  months.flatMap((m): Col<OpsRow>[] => [
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

  // 드롭다운은 앞 선택을 따라 좁아진다 — 솔루션을 고르면 그 솔루션에 있는 국가만 남는다
  const pool = D.rows.filter((r) => !onlyLive || (r.daysLeft ?? 0) > 0)
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

  const sum = (k: "budgetUsd" | "budgetKrw" | "leftKrw") =>
    rows.reduce((a, r) => a + (r[k] || 0), 0)
  const gBud = sum("budgetKrw")
  const gLeft = sum("leftKrw")
  // 월별 칸에 실제로 보이는 값과 같은 우선순위로 더한다 (확정 > 수기 > 계획)
  const months = monthsOf(D.rows)
  const monSum: Record<string, number> = {}
  for (const m of months) {
    const s = rows.reduce((a, r) => a + (r.monKrw?.[m] ?? 0), 0)
    if (s) monSum[m] = s
  }
  const gSpent = Object.values(monSum).reduce((a, v) => a + v, 0)

  const cols = [...BASE_COLS, ...monCols(months)]
  const total: TableRow = {
    __type: "grand",
    sol: "합계",
    budgetUsd: f2(sum("budgetUsd")),
    budgetKrw: f0(gBud),
    leftKrw: f0(gLeft),
    ...Object.fromEntries(Object.entries(monSum).map(([m, v]) => [`krwM${m}`, f0(v)])),
  }

  return (
    <>
      <KpiCards
        items={[
          {
            k: "품의예산 (KRW)",
            v: eok(gBud),
            u: "억원",
            s: `$${f0(sum("budgetUsd"))} · ${rows.length}행`,
          },
          {
            k: "월별 소진 합계",
            v: eok(gSpent),
            u: "억원",
            s: `확정 + 수기 + 계획${gBud ? ` · 소진율 ${((gSpent / gBud) * 100).toFixed(1)}%` : ""}`,
          },
          {
            k: "잔여액",
            v: eok(gLeft),
            u: "억원",
            s:
              gLeft < 0
                ? "품의를 넘겨 집행했습니다"
                : "아직 어느 달에도 배분되지 않은 금액",
          },
          {
            k: "인보이스 확정",
            v: D.closedMonth ? MONLBL(D.closedMonth) : "—",
            s: D.closedMonth ? "그 달까지 실적 · 이후는 계획값" : "확정된 달 없음",
          },
        ]}
      />

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
        <Spacer />
        <Hint>
          {rows.length}행 · 품의 <b>{f0(gBud)}</b> · 소진 <b>{f0(gSpent)}</b> · 잔여{" "}
          <b className={cn("font-semibold", gLeft < 0 && "tint tint-neg")}>{f0(gLeft)}</b>
        </Hint>
      </Toolbar>

      <Card
        title={`품의예산 대비 잔여금 · 세팅 예산 — 기준일 ${D.today}`}
        note={
          <>
            월별 소진 KRW 는 한 달에 하나입니다 — <b className="font-semibold">확정</b>(인보이스,{" "}
            {D.closedMonth ? `${MONLBL(D.closedMonth)}까지` : "없음"}) &gt;{" "}
            <span className="tint tint-info text-[11.5px]">수기</span> (매체 리포트 기준) &gt;{" "}
            <i>계획</i> (잔여액을 남은 일수에 일할 배분 · 실적 아님). 세팅통화 칸도 같은 출처로
            짝을 맞춥니다 · <b className="font-semibold">세팅 일예산</b>은 오늘 매체에 넣을 값,{" "}
            <b className="font-semibold">세팅 총예산</b>은 캠페인 총예산 칸에 넣을 값(이미 태운
            몫 포함)입니다 · 기간은 각 국가 현지 날짜 기준
          </>
        }
      >
        <DataTable cols={cols} rows={[...rows, total]} sortKey="ops" freeze={13} />
      </Card>
    </>
  )
}
