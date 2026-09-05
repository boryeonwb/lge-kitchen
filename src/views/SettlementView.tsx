import { useState } from "react"
import { DataTable, type Col, type TableRow } from "#/components/DataTable"
import { TaxOverrideModal } from "#/components/TaxOverrideModal"
import {
  Card,
  CountryCell,
  KpiCards,
  FilterSelect,
  Hint,
  MonthTabs,
  MultiFilterSelect,
  Spacer,
  Toolbar,
  pickSet,
} from "#/components/ui"
import type { SettlePayload } from "#/lib/api"
import {
  applyOverrides,
  clearOverride,
  loadStore,
  ovTitle,
  saveOverride,
  type SettleRowX,
  type TaxOvStore,
} from "#/lib/taxov"
import { useView } from "#/lib/view"
import { ISSLBL, MONLBL, eok, f0, f2, issMatch, issValues } from "#/lib/format"

/**
 * 정산 탭 — 인보이스에서 읽은 금액과, 그 달 세금계산서로 발행되는 금액.
 *
 *   광고비net(인보이스 통화) ─적용환율→ 매체비KRW
 *   최종 발행금액 = 매체비KRW + 와이즈버즈 수수료KRW
 *     단 처리주체가 HSAD(광고주계정)면 매체비는 광고주가 매체에 직접 지불하므로
 *     와이즈버즈는 수수료만 발행한다 → 그 행의 매체비 칸은 회색으로 죽여 둔다.
 *
 * 키친만 다룬다. 값은 전부 읽기 전용이다.
 */

/** 매체비를 실제로 청구하지 않는 행(HSAD) — 회색으로 구분한다 */
const notBilled = (r: SettleRowX) => (r.owner === "HSAD" ? "notbilled" : "")

const COLS: Col<SettleRowX>[] = [
  { k: "sol", l: "솔루션", w: 92 },
  {
    k: "phase",
    l: "Phase",
    w: 66,
    cls: "text-center",
    // 캠페인명에 Phase 토큰이 없는 라인(DST·무효반영·총액만 오는 매체)은 공란
    fmt: (v) => v || <span className="text-[11px] text-fog">—</span>,
    csv: (v) => v || "",
  },
  { k: "med", l: "매체", w: 78 },
  {
    k: "ctry",
    l: "국가",
    w: 100,
    fmt: (v, r) => <CountryCell ctry={v} kor={r.ctryKor} />,
    csv: (v) => v,
  },

  // ① 인보이스 — 매체가 발행한 인보이스에서 읽은 값
  { k: "cur", l: "통화", w: 46, cls: "text-center", grp: "inv" },
  {
    k: "invTotal",
    l: "인보이스\n최종금액",
    w: 112,
    cls: "text-right",
    grp: "inv",
    // 그 인보이스(계정)의 발행 총액이라 집계행마다 되풀이된다 → 합계를 내지 않는다
    fmt: (v) => <span title="이 라인이 속한 인보이스(계정)의 발행 총액">{f2(v)}</span>,
    csv: f2,
  },
  { k: "dst", l: "DST안분", w: 84, cls: "text-right", grp: "inv", fmt: f2, csv: f2 },
  { k: "invalid", l: "무효반영", w: 84, cls: "text-right", grp: "inv", fmt: f2, csv: f2 },
  {
    k: "billed",
    l: "광고비net",
    w: 104,
    cls: "text-right",
    grp: "inv",
    fmt: (v) => <span title="집행 + DST안분 + 무효반영">{f2(v)}</span>,
    csv: f2,
  },

  // ② 세금계산서 발행
  {
    k: "taxFx",
    l: "적용환율",
    w: 80,
    cls: "text-right",
    grp: "tax",
    fmt: (v) => (v === null || v === undefined ? <span className="text-[11px] text-fog">미입력</span> : f2(v)),
    csv: (v) => (v === null || v === undefined ? "미입력" : f2(v)),
  },
  // 아래 세 열은 수기 수정이 반영된 값(…Adj)을 읽는다. 수정된 행은 ✎ 와 노란 배경으로
  // 드러내고, 마우스를 올리면 담당자·사유·처리방안·이력이 그대로 보인다.
  {
    k: "billMediaAdj",
    l: "매체비KRW",
    w: 122,
    cls: "text-right editable",
    grp: "tax",
    cellCls: (r) =>
      [notBilled(r), r.ov?.media != null || r.srvOv?.media != null ? "edited" : ""]
        .filter(Boolean)
        .join(" "),
    fmt: (v, r) => (
      <span
        title={
          r.ov || r.srvOv
            ? ovTitle(r.srvOv, r.ov)
            : r.owner === "HSAD"
              ? "광고주계정 — 매체비는 광고주가 매체에 직접 지불합니다. 수수료 산정 기준일 뿐 발행 금액에 들어가지 않습니다 · 눌러서 수정"
              : "눌러서 수정"
        }
      >
        {r.ov?.media != null || r.srvOv?.media != null ? "✎ " : ""}
        {f0(v)}
      </span>
    ),
    csv: f0,
  },
  {
    k: "billFeeAdj",
    l: "와이즈버즈\n수수료KRW",
    w: 118,
    cls: "text-right editable",
    grp: "tax",
    cellCls: (r) => (r.ov?.fee != null || r.srvOv?.fee != null ? "edited" : ""),
    fmt: (v, r) => (
      <span title={r.ov || r.srvOv ? ovTitle(r.srvOv, r.ov) : "눌러서 수정"}>
        {r.ov?.fee != null || r.srvOv?.fee != null ? "✎ " : ""}
        {f0(v)}
      </span>
    ),
    csv: f0,
  },
  {
    k: "taxKrwAdj",
    l: "최종 세금계산서\n발행 금액",
    w: 138,
    cls: "text-right editable",
    grp: "tax",
    cellCls: (r) => (r.ov || r.srvOv ? "edited" : ""),
    fmt: (v, r) => (
      <b
        title={
          r.ov || r.srvOv
            ? ovTitle(r.srvOv, r.ov)
            : (r.owner === "HSAD" ? "수수료KRW" : "매체비KRW + 수수료KRW") + " · 눌러서 수정"
        }
      >
        {f0(v)}
      </b>
    ),
    csv: f0,
  },
  {
    k: "issuedMonth",
    l: "세금계산서\n발행월",
    w: 98,
    cls: "text-center",
    grp: "tax",
    fmt: (v) =>
      v ? (
        <span className="tint tint-warn text-[11.5px]">{v}월</span>
      ) : (
        <span className="text-[11px] text-fog">미발행</span>
      ),
    csv: (v) => (v ? `${v}월` : "미발행"),
  },
  {
    k: "owner",
    l: "처리\n주체",
    w: 70,
    cls: "text-center",
    grp: "tax",
    fmt: (v) => (
      <span
        title={
          v === "HSAD"
            ? "광고주계정 — 매체비는 광고주가 직접 집행하고 와이즈버즈는 수수료만 발행합니다"
            : "자사(와이즈버즈)계정 — 매체비와 수수료를 함께 발행합니다"
        }
      >
        {v}
      </span>
    ),
    csv: (v) => v,
  },
]

const MON_COL: Col<SettleRowX> = {
  k: "mon",
  l: "월",
  w: 62,
  cls: "text-center",
  fmt: MONLBL,
  csv: MONLBL,
}

/** KRW 열 합계 — 원화라 그냥 더하면 된다 */
const sumKrw = (rows: SettleRowX[], k: "billMediaAdj" | "billFeeAdj" | "taxKrwAdj") =>
  rows.reduce((a, r) => a + (r[k] || 0), 0)

/**
 * 광고비net 합계 — 인보이스 통화 그대로라 통화가 섞이면 단순 합이 의미 없다.
 * 통화별로 나눠 더하고, 한 가지뿐일 때만 숫자만 보여준다.
 */
function sumNative(rows: SettleRowX[]): { text: string; cur: string } {
  const by: Record<string, number> = {}
  for (const r of rows) by[r.cur] = (by[r.cur] || 0) + (r.billed || 0)
  const es = Object.entries(by)
    .filter(([c, v]) => c && Math.abs(v) >= 0.005)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  if (!es.length) return { text: "", cur: "" }
  if (es.length === 1) return { text: f2(es[0][1]), cur: es[0][0] }
  const one = ([c, v]: [string, number]) => `${c} ${f0(v)}`
  // 통화가 섞이면 셀은 짧게 — 열 폭이 늘어나면 모든 행이 밀린다
  return {
    text: es.length <= 2 ? es.map(one).join(" · ") : `${one(es[0])} · 외 ${es.length - 1}통화`,
    cur: "혼재",
  }
}

/** 소계·총계 한 줄. 값은 이미 포맷된 문자열이라 열 fmt 를 타지 않는다. */
function totalRow(label: string, rows: SettleRowX[], type: "sub" | "grand" = "grand"): TableRow {
  const nat = sumNative(rows)
  return {
    __type: type,
    sol: label,
    cur: nat.cur,
    billed: nat.text,
    billMediaAdj: f0(sumKrw(rows, "billMediaAdj")),
    billFeeAdj: f0(sumKrw(rows, "billFeeAdj")),
    taxKrwAdj: f0(sumKrw(rows, "taxKrwAdj")),
  }
}

export function SettlementView({ D }: { D: SettlePayload }) {
  const { mon, filt } = useView()
  const monLab = mon ? MONLBL(mon) : "전체월"

  // 수기 수정은 이 브라우저에만 남는다(서버에 쓰지 않는다) — lib/taxov.ts 참고
  const [store, setStore] = useState<TaxOvStore>(loadStore)
  const [editId, setEditId] = useState<string | null>(null)
  const all = applyOverrides(D.rows, store)

  // 드롭다운은 연쇄 구조 — 월 → 솔루션 → 매체 → 국가 → Phase → 발행월 순으로
  // 실제 존재하는 값만 남긴다. 앞 선택이 바뀌면 뒤 후보도 같이 줄어든다.
  const pool = all.filter((r) => !mon || r.mon === mon)

  const sols = [...new Set(pool.map((r) => r.sol))].sort(
    (a, b) => pool.find((r) => r.sol === a)!.solOrd - pool.find((r) => r.sol === b)!.solOrd,
  )
  const vSol = sols.includes(filt.sol) ? filt.sol : ""
  const spool = pool.filter((r) => !vSol || r.sol === vSol)

  const meds = [...new Set(spool.map((r) => r.med))].sort(
    (a, b) => spool.find((r) => r.med === a)!.medOrd - spool.find((r) => r.med === b)!.medOrd,
  )
  const medSel = pickSet(filt.med, meds)
  const cpool = spool.filter((r) => !medSel.size || medSel.has(r.med))

  const ctrys = [...new Set(cpool.map((r) => r.ctry))].sort((a, b) => a.localeCompare(b, "ko"))
  const vCtry = ctrys.includes(filt.ctry) ? filt.ctry : ""
  const ppool = cpool.filter((r) => !vCtry || r.ctry === vCtry)

  const phases = [...new Set(ppool.map((r) => r.phase))].sort(
    (a, b) =>
      ppool.find((r) => r.phase === a)!.phaseOrd - ppool.find((r) => r.phase === b)!.phaseOrd,
  )
  const vPh = phases.includes(filt.phase) ? filt.phase : ""
  const ipool = ppool.filter((r) => !vPh || r.phase === vPh)

  const isss = issValues(ipool.map((r) => r.issuedMonth))
  const vIss = isss.includes(filt.iss) ? filt.iss : ""

  const rows = ipool
    .filter((r) => issMatch(vIss, r.issuedMonth))
    .sort(
      (a, b) =>
        a.solOrd - b.solOrd ||
        a.sol.localeCompare(b.sol) ||
        a.mon.localeCompare(b.mon) ||
        a.phaseOrd - b.phaseOrd ||
        a.phase.localeCompare(b.phase) ||
        a.medOrd - b.medOrd ||
        a.med.localeCompare(b.med) ||
        a.ctry.localeCompare(b.ctry),
    )

  // 솔루션 소계 + 총계
  const out: TableRow[] = []
  let cur: string | null = null
  let bucket: SettleRowX[] = []
  const pushSub = () => {
    if (cur !== null) out.push(totalRow(`${cur} 소계`, bucket, "sub"))
  }
  for (const r of rows) {
    if (r.sol !== cur) {
      pushSub()
      bucket = []
      cur = r.sol
    }
    out.push(r)
    bucket.push(r)
  }
  pushSub()
  out.push(totalRow(`${monLab} 합계`, rows))

  const gTax = sumKrw(rows, "taxKrwAdj")
  const gFee = sumKrw(rows, "billFeeAdj")
  const nIssued = rows.filter((r) => r.issuedMonth).length
  const nOv = rows.filter((r) => r.ov || r.srvOv).length

  const editRow = editId ? all.find((r) => r.id === editId) : undefined
  const cols = mon ? COLS : [MON_COL, ...COLS]
  const freeze = mon ? 4 : 5 // (월 +) 솔루션 · Phase · 매체 · 국가

  return (
    <>
      <KpiCards
        items={[
          {
            k: `${monLab} 세금계산서 발행 금액`,
            v: f0(gTax),
            u: "원",
            s: `${eok(gTax)}억원${nOv ? ` · 수기 수정 ${nOv}행 반영됨` : ""}`,
          },
          {
            k: "와이즈버즈 수수료",
            v: f0(gFee),
            u: "원",
            s: `${eok(gFee)}억원`,
          },
          {
            k: "세금계산서 발행",
            v: `${nIssued} / ${rows.length}`,
            s: "발행월이 지정된 행 / 전체 행",
          },
        ]}
      />

      <Toolbar>
        <MonthTabs />
        <FilterSelect fkey="sol" label="솔루션" values={sols} />
        <MultiFilterSelect fkey="med" label="매체" values={meds} />
        <FilterSelect
          fkey="ctry"
          label="국가"
          values={ctrys}
          display={(v) => {
            const r = cpool.find((x) => x.ctry === v)
            return r?.ctryKor && r.ctryKor !== v ? `${v} (${r.ctryKor})` : v
          }}
        />
        <FilterSelect fkey="phase" label="Phase" values={phases} display={(v) => v || "(구분없음)"} />
        <FilterSelect fkey="iss" label="발행월" values={isss} display={ISSLBL} />
        <Spacer />
        <Hint>
          {rows.length}행
          {vSol ? ` · ${vSol}` : ""}
          {medSel.size ? ` · ${[...medSel].join("+")}` : ""}
          {vCtry ? ` · ${vCtry}` : ""}
          {vPh ? ` · ${vPh}` : ""}
          {vIss ? ` · ${ISSLBL(vIss)} 발행` : ""}
        </Hint>
      </Toolbar>

      <Card
        title={`정산 · ${monLab}`}
        note={
          <>
            <b className="font-semibold">광고비net</b> = 집행 + DST안분 + 무효반영 ·{" "}
            <b className="font-semibold">최종 발행 금액</b> = 매체비KRW + 수수료KRW. 단 처리주체가{" "}
            <b className="font-semibold">HSAD(광고주계정)</b>인 행은 매체비를 광고주가 매체에 직접
            지불하므로 수수료만 발행합니다 — 그 행의 매체비 칸은 흐리게 내려둡니다 ·{" "}
            <b className="font-semibold">인보이스 최종금액</b>은 그 라인이 속한 인보이스의 발행 총액이라
            집계행마다 되풀이됩니다 — 합계를 내지 않습니다
          </>
        }
      >
        <DataTable
          cols={cols}
          rows={out}
          nosort
          freeze={freeze}
          grouped
          onCellClick={(r, c) =>
            c.cls?.includes("editable") ? setEditId((r as SettleRowX).id) : undefined
          }
        />
      </Card>

      {editRow ? (
        <TaxOverrideModal
          row={editRow}
          onClose={() => setEditId(null)}
          onSave={(e) => {
            setStore(saveOverride(store, editRow.id, e))
            setEditId(null)
          }}
          onClear={() => {
            setStore(clearOverride(store, editRow.id))
            setEditId(null)
          }}
        />
      ) : null}
    </>
  )
}
