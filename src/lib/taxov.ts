import type { TaxOvRec } from "#/lib/api"

/**
 * 세금계산서 수기 수정 **표시** — 이 화면은 읽기만 한다.
 *
 * 수정은 내부 정산 대시보드에서만 한다(지시). 거기서 고친 값은 서버가 이미
 * `billMedia`·`billFee`·`taxKrw` 에 반영해 내려 주므로, 여기서 할 일은 **누가 왜
 * 고쳤는지**를 숫자 옆에 붙여 주는 것뿐이다 — 근거 없는 금액은 물어볼 곳이 없어서
 * 결국 못 쓴다.
 *
 * 한때 이 화면에도 수정 기능을 뒀지만 걷어냈다: 여기 저장한 값은 이 브라우저에만
 * 남아 다른 사람 화면에 가지 않는데, 공유되는 줄 알면 없는 숫자를 근거로 일이
 * 진행된다. 기록은 한 곳(내부 대시보드)에만 있어야 한다.
 */

/** 금액 한 조각 — 비운 항목은 자동 계산값을 쓴 것이라 적지 않는다 */
const money = (v: number | null | undefined, l: string) =>
  v === null || v === undefined ? "" : `${l} ${v.toLocaleString("ko-KR")}원`

const line = (e: Omit<TaxOvRec, "history">, head: string) =>
  [head, money(e.media, "매체비"), money(e.fee, "수수료"), e.by, e.reason, e.at]
    .filter(Boolean)
    .join(" · ")

/**
 * 셀에 붙일 수정 내역 — 마우스를 올리면 보이는 글.
 *
 * **최종 저장본만 낸다**(지시). 이전 이력까지 쌓으면 툴팁이 여러 줄로 늘어져 정작
 * 지금 적용된 값이 무엇인지 한눈에 안 들어온다 — 이 화면에서 알아야 하는 건
 * "지금 이 숫자가 왜 이 값인가" 하나다.
 */
export function ovTitle(ov: TaxOvRec): string {
  return line(ov, "✎ 내부 대시보드에서 수정됨")
}
