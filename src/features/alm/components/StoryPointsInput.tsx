import { useEffect, useId, useState } from "react";
import { Button, TextField } from "@chanho/react";
import type { PlanningSettings } from "../store/types";
import { ESTIMATION_SCALE_LABELS, TSHIRT_SIZES, tshirtLabelOf } from "../store/model/cycles";
import "./storyPoints.css";

export interface StoryPointsInputProps {
  /** 접근 이름(필수 `*` 포함 가능) — 보이는 라벨은 FieldLabel이 그린다 */
  label: string;
  value: number | null;
  /** 칩은 고르는 즉시, 수직선 입력은 흐림·Enter에 확정한다 */
  onChange: (next: number | null) => void;
  /** 프로젝트 계획 설정 — 없으면(못 읽음·불러오는 중) 수직선 입력 */
  settings: PlanningSettings | null;
  disabled?: boolean;
}

/**
 * 스토리 포인트 입력(Linear Estimates) — 프로젝트 추정 척도에 맞는 선택.
 * - 피보나치·직접 정의: 숫자 칩, T셔츠: XS~XL 칩(저장은 매핑한 숫자), 수직선: 숫자 입력(0~9999, 0.5 단위).
 * - 척도 밖 옛 값은 지우지 않고 "척도 밖" 칩으로 남긴다(서버도 손대지 않은 값은 그대로 둔다).
 */
export function StoryPointsInput({ label, value, onChange, settings, disabled = false }: StoryPointsInputProps) {
  const groupId = useId();
  const scale = settings?.estimationScale ?? "linear";
  const allowed = settings?.allowedPoints ?? null;

  if (scale === "linear" || !allowed || !settings) {
    return <LinearPointsInput label={label} value={value} onChange={onChange} disabled={disabled} />;
  }

  const options: { points: number; text: string; name: string }[] =
    scale === "tshirt"
      ? TSHIRT_SIZES.map((size) => ({
          points: settings.tshirtPoints[size],
          text: size,
          name: `${size} — ${settings.tshirtPoints[size]}포인트`,
        }))
      : allowed.map((points) => ({ points, text: String(points), name: `${points}포인트` }));
  const outOfScale = value !== null && !options.some((o) => o.points === value);

  return (
    <div className="story-points" role="group" aria-label={label} aria-describedby={`${groupId}-scale`}>
      <span id={`${groupId}-scale`} className="visually-hidden">{`척도: ${ESTIMATION_SCALE_LABELS[scale]}`}</span>
      {options.map((option) => (
        <Button
          key={option.text}
          type="button"
          size="small"
          variant={value === option.points ? "primary" : "secondary"}
          className="story-points-chip"
          aria-pressed={value === option.points}
          aria-label={option.name}
          title={option.name}
          disabled={disabled}
          onClick={() => onChange(value === option.points ? null : option.points)}
        >
          {option.text}
        </Button>
      ))}
      {outOfScale ? (
        <Button
          type="button"
          size="small"
          variant="primary"
          className="story-points-chip"
          aria-pressed
          aria-label={`${value}포인트 (척도 밖 값)`}
          title="척도를 바꾸기 전에 저장된 값 — 다른 값을 고르면 바뀝니다"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          {`${value} · 척도 밖`}
        </Button>
      ) : null}
      {value !== null ? (
        <Button type="button" size="small" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
          지우기
        </Button>
      ) : null}
      {scale === "tshirt" && value !== null && tshirtLabelOf(value, settings.tshirtPoints) ? (
        <span className="story-points-sum">{`= ${value}포인트`}</span>
      ) : null}
    </div>
  );
}

function LinearPointsInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);
  const commit = () => {
    const next = draft.trim() === "" ? null : Number(draft);
    if (next !== null && Number.isNaN(next)) return;
    if (next === value) return;
    onChange(next);
  };
  return (
    <TextField
      label={label}
      className="visually-hidden-label"
      type="number"
      min={0}
      max={9999}
      step={0.5}
      placeholder="미지정"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
