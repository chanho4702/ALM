import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banner, Button, Modal, TextArea, TextField } from "@chanho/react";
import type { ProjectVersion } from "../store/types";

export interface VersionDraft {
  name: string;
  description: string;
  startDate: string;
  releaseDate: string;
}

export const draftOf = (version: ProjectVersion): VersionDraft => ({
  name: version.name,
  description: version.description ?? "",
  startDate: version.startDate ?? "",
  releaseDate: version.releaseDate ?? "",
});

export interface VersionEditModalProps {
  /** null이면 닫힘 — 열 때(다른 버전으로 바뀔 때) 이 값으로 초안을 채운다 */
  version: ProjectVersion | null;
  onClose: () => void;
  onSave: (version: ProjectVersion, draft: VersionDraft) => void;
  /** 저장이 409(다른 사람이 먼저 수정)로 막혔다 — 초안을 유지한 채 해소 선택지를 보인다 */
  conflict?: boolean;
  /** reload = 최신 값으로 초안을 다시 채움(내 입력 버림), reapply = 최신 버전 기준으로 내 초안을 다시 저장 */
  onResolveConflict?: (draft: VersionDraft, mode: "reload" | "reapply") => void;
  /** 저장 중 — 끝날 때까지 입력을 잠근다(성공하면 닫히므로 그 사이 입력을 조용히 잃지 않게) */
  saving?: boolean;
  /** 값이 바뀌면 지금 `version`으로 초안을 다시 채운다 — 충돌 해소의 "최신 내용 불러오기" */
  reloadToken?: number;
}

/**
 * 버전 수정 — 지라 릴리스 화면의 "편집"(이름·설명·시작일·릴리스 예정일). 검증(이름 중복·날짜 역전)은 스토어·서버가 한다.
 * 스프린트 수정 모달과 같은 모양·같은 충돌 해소 흐름이다.
 */
export function VersionEditModal({
  version,
  onClose,
  onSave,
  conflict = false,
  onResolveConflict,
  saving = false,
  reloadToken = 0,
}: VersionEditModalProps) {
  const [draft, setDraft] = useState<VersionDraft>({ name: "", description: "", startDate: "", releaseDate: "" });

  // 다른 버전을 열 때와 "불러오기"를 고를 때만 초안을 덮는다 — 충돌 뒤 기준 버전이 바뀌어도 입력을 지우지 않는다
  useEffect(() => {
    if (version) setDraft(draftOf(version));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id, reloadToken]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (version && !saving) onSave(version, draft);
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="버전 수정"
      description="릴리스 예정일은 릴리스 허브와 로드맵에 표시됩니다."
      open={version !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form className="sprint-edit-form" onSubmit={handleSubmit} aria-busy={saving}>
        <fieldset className="sprint-edit-fieldset" disabled={saving}>
          {conflict && version ? (
            <Banner variant="warning">
              <div className="issue-conflict">
                <p className="issue-conflict-text">
                  다른 사용자가 이 버전을 먼저 수정해 저장하지 않았습니다. 입력한 내용은 그대로 남아 있습니다.
                </p>
                <div className="issue-conflict-actions">
                  <Button
                    size="small"
                    variant="secondary"
                    type="button"
                    disabled={saving}
                    onClick={() => onResolveConflict?.(draft, "reload")}
                  >
                    최신 내용 불러오기
                  </Button>
                  <Button
                    size="small"
                    variant="primary"
                    type="button"
                    disabled={saving}
                    onClick={() => onResolveConflict?.(draft, "reapply")}
                  >
                    내 변경 다시 적용(최신 버전 기준)
                  </Button>
                </div>
              </div>
            </Banner>
          ) : null}
          <TextField
            label="버전 이름"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <TextArea
            label="설명"
            rows={2}
            placeholder="이 버전에 무엇이 담기나요? (선택)"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="sprint-edit-grid">
            <TextField
              label="시작일"
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
            <TextField
              label="릴리스 예정일"
              type="date"
              value={draft.releaseDate}
              onChange={(e) => setDraft({ ...draft, releaseDate: e.target.value })}
            />
          </div>
          <div className="project-form-actions">
            <Button variant="ghost" type="button" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" loading={saving} disabled={!draft.name.trim()}>
              저장
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
