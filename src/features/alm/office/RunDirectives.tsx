import { useCallback, useState, type FormEvent } from "react";
import { Button, TextArea, useToast } from "@chanho/react";
import { MailPlus, Send } from "lucide-react";
import type { AgentRunDirective, AgentRunSummary } from "../store/types";
import { fetchRunDirectives, sendRunDirective } from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { AgentDirectiveDeliveryLozenge } from "../components/AgentGlyphs";
import { formatDateTime, relTime } from "../components/time";
import { usePolledLoad } from "./usePolledLoad";

/** 실행 중이면 전달 상태를 자주, 끝난 run은 목록이 거의 바뀌지 않으니 느긋하게 */
const RUNNING_POLL_MS = 5000;
const IDLE_POLL_MS = 60_000;
const DIRECTIVE_MAX = 2000;

function When({ iso }: { iso: string | null }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return <span className="agent-sup-subtle">—</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relTime(iso)}
    </time>
  );
}

/**
 * 실행 상세 "사람 지시"(P4b D-P4b-5, AGP-67) — 이 run에 보낸 지시와 전달 시각. 실행 중(RUNNING)이고 관리자면 작성 칸.
 * 지시는 워커의 다음 도구 호출 결과 끝에 붙어 전달된다. 구 백엔드(목록 404 → null)면 구획 자체를 그리지 않는다.
 */
export function RunDirectivesSection({ run, canManage, onStale }: { run: AgentRunSummary; canManage: boolean; onStale: () => void }) {
  const toast = useToast();
  const running = run.status === "RUNNING";
  const loadDirectives = useCallback(() => fetchRunDirectives(run.id), [run.id]);
  const load = usePolledLoad(loadDirectives, running ? RUNNING_POLL_MS : IDLE_POLL_MS);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // 지시 API가 없는 서버 — 조용히 숨긴다(코멘트가 대안). 첫 조회 전에도 그리지 않는다(구 백엔드에서 제목이 번쩍이지 않게)
  if (load.status === "loading" || (load.status === "ready" && load.data === null)) return null;

  const directives: AgentRunDirective[] = load.data ?? [];
  const tooLong = text.trim().length > DIRECTIVE_MAX;

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || tooLong || sending) return;
    setSending(true);
    try {
      await sendRunDirective(run.id, body);
      setText("");
      toast({ title: "지시를 보냈습니다", description: "워커의 다음 도구 호출 때 전달됩니다", appearance: "success" });
      await load.refresh();
    } catch (error) {
      toast({
        title: "지시를 보내지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
      // 409 = 이미 실행 중이 아니다 — run 상태를 새로 받아 작성 칸을 닫는다
      if (errorStatus(error) === 409) onStale();
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="agent-run-directives" aria-labelledby="agent-run-directives-title">
      <h3 id="agent-run-directives-title" className="agent-sup-subtitle">
        <MailPlus size={16} aria-hidden /> 사람 지시
      </h3>
      {load.status === "error" ? (
        <div className="agent-run-directives-error">
          <p role="alert">지시 목록을 불러오지 못했습니다 — {load.error}</p>
          <Button variant="secondary" size="small" onClick={() => void load.refresh()}>
            다시 시도
          </Button>
        </div>
      ) : directives.length === 0 ? (
        <p className="agent-sup-subtle">이 실행에 보낸 지시가 없습니다.</p>
      ) : (
        <ol className="agent-run-directive-list" aria-label="사람 지시 목록">
          {directives.map((d) => (
            <li key={d.id} className="agent-run-directive">
              <div className="agent-run-directive-head">
                <AgentDirectiveDeliveryLozenge delivered={d.deliveredAt !== null} runEnded={!running} />
                <span className="agent-sup-subtle">
                  보냄 <When iso={d.createdAt} />
                  {d.deliveredAt ? (
                    <>
                      {" · "}전달 <When iso={d.deliveredAt} />
                    </>
                  ) : null}
                </span>
              </div>
              {d.text !== null ? (
                <p className="agent-run-directive-text">{d.text}</p>
              ) : (
                <p className="agent-sup-subtle">(관리자만 볼 수 있는 지시)</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {canManage && running ? (
        <form className="agent-run-directive-form" onSubmit={send}>
          <TextArea
            label="지시 내용"
            rows={3}
            value={text}
            placeholder="예: 테스트는 통합 테스트까지 돌리고 끝내 주세요"
            description={`${text.trim().length.toLocaleString("ko-KR")} / ${DIRECTIVE_MAX.toLocaleString("ko-KR")}자 · 작업을 멈추지 않고 다음 도구 호출 결과에 붙어 전달됩니다`}
            error={tooLong ? `${DIRECTIVE_MAX.toLocaleString("ko-KR")}자 이하로 줄여 주세요` : undefined}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="agent-run-directive-actions">
            <Button type="submit" iconBefore={<Send size={14} aria-hidden />} disabled={!text.trim() || tooLong} loading={sending}>
              지시 보내기
            </Button>
          </div>
        </form>
      ) : canManage ? (
        <p className="agent-sup-subtle">실행 중일 때만 지시할 수 있습니다. 다음 실행에 전하려면 이슈에 코멘트를 남기세요.</p>
      ) : null}
    </section>
  );
}
