import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { TextField } from "@chanho/react";
import { validateAql } from "../store/jiraStore";
import { completeAql, type AqlSuggestion } from "../store/aql/complete";
import type { AqlFieldsInfo } from "../store/aql/fields";
import { AQL_MAX_LENGTH } from "../store/aql/types";

export interface AqlEditorError {
  message: string;
  /** 밑줄을 그을 자리. null이면 가리킬 데가 없는 오류라 메시지만 보여 준다(길이 초과 등) */
  position: number | null;
}

export interface AqlEditorProps {
  /** URL(`?aql=`)에 들어 있는 값 — 편집 중이 아닐 때만 초안에 동기화한다 */
  value: string;
  /** Enter로 실행 */
  onRun: (aql: string) => void;
  /** 자동완성 카탈로그 — 필드·연산자·값 후보 */
  fields: AqlFieldsInfo;
  /** 실행에서 돌아온 오류(서버 400 포함). 실시간 검증보다 우선해 보여준다 */
  runError?: AqlEditorError | null;
}

const DEBOUNCE_MS = 300;

/**
 * AQL 한 줄 에디터 — 자동완성 팝업 + 실시간 검증 밑줄.
 * DS `Dropdown`은 항목을 고르면 닫히는 단일선택 메뉴라 쓸 수 없어 `role="listbox"` 커스텀을 쓴다
 * (마크업은 디자인 토큰만 — `app.css`의 `.aql-*`).
 */
export function AqlEditor({ value, onRun, fields, runError }: AqlEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(value.length);
  const [open, setOpen] = useState(false);
  /** -1 = 아무 항목도 고르지 않음 — 이 상태의 Enter는 "실행"이다(지라 JQL 에디터와 같다) */
  const [active, setActive] = useState(-1);
  const [liveError, setLiveError] = useState<AqlEditorError | null>(null);
  /** 밑줄 겹침 층은 입력이 가로로 스크롤되면 같이 밀어야 자리가 맞는다 */
  const [scrollLeft, setScrollLeft] = useState(0);

  // 포커스 중이 아닐 때만 URL에서 되받는다 (타이핑 클로버 방지 — searchQuery 화면과 같은 규칙)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value);
      setCursor(value.length);
    }
  }, [value]);

  // 실시간 검증 — 300ms 디바운스
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void validateAql(draft).then((result) => {
        setLiveError(
          result.ok || !result.error
            ? null
            : { message: result.error, position: result.position ?? null },
        );
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const completion = useMemo(
    () => completeAql(draft, Math.min(cursor, draft.length), fields),
    [draft, cursor, fields],
  );
  const suggestions = completion.suggestions;

  useEffect(() => {
    setActive(-1);
  }, [suggestions.length, draft]);

  const error = runError ?? liveError;
  // 실행 오류는 그때의 문자열에 대한 것이다 — 편집을 시작하면 실시간 검증만 남는다
  const showError = error && draft.length > 0 ? error : null;

  const apply = useCallback(
    (suggestion: AqlSuggestion) => {
      const head = draft.slice(0, completion.from);
      const tail = draft.slice(Math.min(cursor, draft.length));
      const inserted = `${completion.needsSpace ? " " : ""}${suggestion.insert}`;
      const next = `${head}${inserted}${tail}`;
      const caret = head.length + inserted.length;
      setDraft(next);
      setCursor(caret);
      setOpen(true);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(caret, caret);
      });
    },
    [completion.from, completion.needsSpace, cursor, draft],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const listOpen = open && suggestions.length > 0;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!listOpen) setOpen(true);
      else setActive((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!listOpen) setOpen(true);
      else setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
      return;
    }
    if (event.key === "Escape") {
      if (listOpen) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === "Tab" && listOpen) {
      event.preventDefault();
      apply(suggestions[Math.max(active, 0)]);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // 목록이 떠 있어도 ↑↓로 고르지 않았으면 실행이 먼저다
      if (listOpen && active >= 0) apply(suggestions[active]);
      else {
        setOpen(false);
        onRun(draft.trim());
      }
    }
  };

  const syncCursor = () => setCursor(inputRef.current?.selectionStart ?? draft.length);

  return (
    <div className="aql-editor">
      <div className="aql-input-wrap">
        <TextField
          ref={inputRef}
          className="aql-input visually-hidden-label"
          label="AQL"
          value={draft}
          maxLength={AQL_MAX_LENGTH}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          {...(open && suggestions.length > 0 ? { "aria-controls": "aql-suggestions" } : {})}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 ? `aql-suggestion-${active}` : undefined
          }
          placeholder="예: project = ALM AND status != 완료 AND assignee = currentUser() ORDER BY due ASC"
          onChange={(event) => {
            setDraft(event.target.value);
            setCursor(event.target.selectionStart ?? event.target.value.length);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
        {/* 오류 위치 밑줄 — 입력과 같은 상자·같은 타이포로 겹쳐 그린다(글자는 투명) */}
        <div className="aql-underlay" aria-hidden>
          <div className="aql-underlay-scroll" style={{ transform: `translateX(${-scrollLeft}px)` }}>
            {showError && showError.position !== null ? (
              <ErrorUnderline text={draft} position={showError.position} />
            ) : null}
          </div>
        </div>
        {open && suggestions.length > 0 ? (
          <ul className="aql-suggestions" id="aql-suggestions" role="listbox" aria-label="AQL 자동완성">
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.kind}-${suggestion.label}`}
                id={`aql-suggestion-${index}`}
                role="option"
                aria-selected={index === active}
                className={`aql-suggestion${index === active ? " is-active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  apply(suggestion);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="aql-suggestion-label">{suggestion.label}</span>
                {suggestion.detail ? (
                  <span className="aql-suggestion-detail">{suggestion.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {/* 통과를 "성공"으로 표시하지 않는다 — 검증은 문법·필드만 보고 값 실재는 실행에서 걸린다 */}
      {showError ? (
        <p className="aql-error" role="status" data-testid="aql-error">
          {showError.message}
        </p>
      ) : (
        <p className="aql-hint">
          Enter로 실행 · 예: <code>project = ALM AND status != 완료 AND assignee = currentUser() ORDER BY due ASC</code>
        </p>
      )}
    </div>
  );
}

/** 오류 위치의 토큰에 물결 밑줄 — 끝을 가리키면 한 칸을 표시한다 */
function ErrorUnderline({ text, position }: { text: string; position: number }) {
  const start = Math.max(0, Math.min(position, text.length));
  let end = start;
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  const marked = text.slice(start, end) || " ";
  return (
    <>
      <span>{text.slice(0, start)}</span>
      <span className="aql-underline">{marked}</span>
    </>
  );
}
