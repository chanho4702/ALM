import { useState } from "react";
import { Bookmark, MoreHorizontal, Star } from "lucide-react";
import { Badge, Button, ConfirmDialog, Dropdown, Modal, Popover, Radio, RadioGroup, TextField } from "@chanho/react";
import type { DropdownItem } from "@chanho/react";
import type { ViewScope } from "../../store/types";
import type { IssueViewsController } from "./useIssueViews";
import "./views.css";
import "../favorites.css";
import { favoriteOfView, useFavorites } from "../useFavorites";

/**
 * 저장된 보기 고르기 + 보기 작업(저장·업데이트·삭제·닫기). 상태와 서버 호출은 `useIssueViews`가 맡는다.
 * 공유 보기는 "프로젝트 공유" 배지로 구분한다.
 */
export function SavedViewsBar({ controller }: { controller: IssueViewsController }) {
  const { views, viewsError, active, dirty, engaged, saving, conflict } = controller;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { isPinned, toggle: toggleFavorite } = useFavorites();
  const pinned = active ? isPinned("view", active.id) : false;

  const items: DropdownItem[] = [
    { label: "보기로 저장", onSelect: () => setSaveOpen(true), disabled: saving },
  ];
  if (active?.canEdit) {
    items.push(
      { label: "현재 보기 업데이트", onSelect: () => void controller.updateCurrent(), disabled: saving || !dirty },
      { label: "보기 삭제", danger: true, onSelect: () => setConfirmDelete(true), disabled: saving },
    );
  }
  if (active || engaged) {
    items.push({ separator: true }, { label: "보기 닫기", onSelect: controller.closeView });
  }

  return (
    <div className="saved-views-bar">
      <Popover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        label="저장된 보기 목록"
        className="saved-views-picker"
        padding="none"
        trigger={
          <Button variant={active ? "subtle" : "secondary"} iconBefore={<Bookmark size={16} aria-hidden />}>
            {active ? `보기: ${active.name}` : "저장된 보기"}
          </Button>
        }
      >
        {viewsError !== null ? (
          <div className="saved-views-empty" role="alert">
            <p>보기 목록을 불러오지 못했습니다</p>
            <Button size="small" variant="secondary" onClick={controller.retryViews}>
              다시 시도
            </Button>
          </div>
        ) : views.length === 0 ? (
          <p className="saved-views-empty">저장된 보기가 없습니다. 표시 옵션을 바꾼 뒤 "보기로 저장"을 고르세요.</p>
        ) : (
          <ul className="saved-views-list" aria-label="저장된 보기">
            {views.map((view) => (
              <li key={view.id}>
                <button
                  type="button"
                  className="saved-views-item"
                  aria-current={active?.id === view.id ? "true" : undefined}
                  onClick={() => {
                    setPickerOpen(false);
                    controller.selectView(view.id);
                  }}
                >
                  <span className="saved-views-item-name">{view.name}</span>
                  {view.scope === "project" ? <Badge appearance="brand">프로젝트 공유</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
      {active ? (
        <Button
          variant="ghost"
          iconOnly
          className={pinned ? "favorite-toggle is-pinned" : "favorite-toggle"}
          aria-label={`보기 ${active.name} 즐겨찾기`}
          aria-pressed={pinned}
          title={pinned ? "즐겨찾기에서 빼기" : "사이드바 즐겨찾기에 추가"}
          onClick={() => void toggleFavorite(favoriteOfView(active))}
        >
          <Star size={16} fill={pinned ? "currentColor" : "none"} aria-hidden />
        </Button>
      ) : null}
      {dirty ? <Badge>변경됨</Badge> : null}
      <Dropdown
        align="end"
        items={items}
        trigger={
          <Button variant="ghost" iconOnly aria-label="보기 작업">
            <MoreHorizontal size={16} aria-hidden />
          </Button>
        }
      />
      {saveOpen ? (
        <SaveViewModal
          canShare={controller.canShare}
          saving={saving}
          onClose={() => setSaveOpen(false)}
          onSave={async (name, scope) => {
            if (await controller.saveAs(name, scope)) setSaveOpen(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="보기 삭제"
        description={active ? `"${active.name}" 보기를 삭제합니다. 이 보기를 쓰던 사람 모두에게서 사라집니다.` : undefined}
        confirmLabel="삭제"
        danger
        loading={saving}
        onConfirm={() => {
          setConfirmDelete(false);
          void controller.deleteCurrent();
        }}
      />
      <ConfirmDialog
        open={conflict}
        onOpenChange={(next) => {
          if (!next) controller.dismissConflict();
        }}
        title="다른 사람이 먼저 보기를 수정했습니다"
        description="최신 보기를 다시 불러오면 지금 바꾼 표시 옵션은 버려집니다."
        confirmLabel="최신 보기 불러오기"
        onConfirm={() => void controller.reloadCurrent()}
      />
    </div>
  );
}

function SaveViewModal({
  canShare,
  saving,
  onClose,
  onSave,
}: {
  canShare: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string, scope: ViewScope) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ViewScope>("personal");
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("보기 이름을 입력하세요");
      return;
    }
    void onSave(trimmed, canShare ? scope : "personal");
  };

  return (
    <Modal
      open
      title="보기로 저장"
      description="지금 필터와 표시 옵션을 이름 붙여 저장합니다. 결과는 여는 사람의 권한으로 다시 조회됩니다."
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form
        className="saved-views-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label="이름"
          value={name}
          maxLength={100}
          autoFocus
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        <fieldset className="saved-views-scope">
          <legend>공유 범위</legend>
          <RadioGroup
            value={scope}
            onValueChange={(value) => setScope(value === "project" ? "project" : "personal")}
            aria-label="공유 범위"
          >
            <Radio value="personal" label="개인" />
            <Radio value="project" label="프로젝트 공유" disabled={!canShare} />
          </RadioGroup>
          {!canShare ? (
            <p className="saved-views-hint">프로젝트 공유 보기는 이 프로젝트의 편집 권한이 있어야 만들 수 있습니다.</p>
          ) : null}
        </fieldset>
        <div className="saved-views-form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={saving}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}
