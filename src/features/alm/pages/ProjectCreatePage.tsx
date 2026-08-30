import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Badge, Button, Card, Lozenge, PageHeader, TextArea, TextField, useToast } from "@chanho/react";
import { createProject } from "../store/jiraStore";
import { PROJECT_TEMPLATES } from "../store/projectTemplates";
import type { ProjectTemplateId } from "../store/projectTemplates";

export interface ProjectCreatePageProps {
  onProjectsChanged: () => void | Promise<void>;
}

/** 영문 이름이면 단어 이니셜로 키를 제안한다 (한글 등은 제안 없음, 최대 5자) */
function suggestKey(name: string): string {
  const words = name.match(/[A-Za-z]+/g);
  if (!words) return "";
  return words
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 5);
}

type Step = "template" | "details";

/**
 * 프로젝트 만들기 — 지라와 같은 2단계: ① 템플릿 선택 → ② 세부 정보(이름·키·설명) + 선택한 템플릿 미리보기.
 * 생성 즉시 새 프로젝트 보드로 이동한다.
 */
export function ProjectCreatePage({ onProjectsChanged }: ProjectCreatePageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>("template");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  /** 키를 직접 만졌으면 이름 기반 자동 제안을 멈춘다 */
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<ProjectTemplateId>("blank");
  const [submitting, setSubmitting] = useState(false);
  const template = PROJECT_TEMPLATES.find((t) => t.id === templateId) ?? PROJECT_TEMPLATES[0];

  const handleNameChange = (next: string) => {
    setName(next);
    if (!keyTouched) setKey(suggestKey(next));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const project = await createProject({ key, name, description, templateId });
      toast({ title: `프로젝트 ${project.key}를 만들었습니다`, appearance: "success" });
      await onProjectsChanged();
      navigate(`/projects/${project.id}/board`);
    } catch (error) {
      toast({
        title: "프로젝트 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const keyPreview = key.trim() ? `${key.trim().toUpperCase()}-1` : "KEY-1";

  return (
    <main className="project-list-content pcreate-page">
      <PageHeader title="프로젝트 만들기" />
      <p className="pcreate-lead">
        {step === "template"
          ? "팀의 작업 방식에 맞는 템플릿을 고르세요. 보드 구성은 나중에도 바꿀 수 있습니다."
          : "프로젝트 이름과 키를 정하세요. 키는 이슈 번호의 접두어가 됩니다."}
      </p>
      <ol className="pcreate-steps" aria-label="진행 단계">
        <li className={step === "template" ? "is-current" : "is-done"} aria-current={step === "template" ? "step" : undefined}>
          <span className="pcreate-step-index">1</span> 템플릿 선택
        </li>
        <li className={step === "details" ? "is-current" : undefined} aria-current={step === "details" ? "step" : undefined}>
          <span className="pcreate-step-index">2</span> 세부 정보
        </li>
      </ol>

      {step === "template" ? (
        <>
          {/* 템플릿 선택 — 카드가 실제로 만들어질 컬럼 구성을 그대로 보여준다 (ALM 특색) */}
          <div className="template-grid" role="radiogroup" aria-label="프로젝트 템플릿" data-testid="template-grid">
            {PROJECT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={templateId === t.id}
                className={templateId === t.id ? "template-card is-selected" : "template-card"}
                onClick={() => setTemplateId(t.id)}
                onDoubleClick={() => setStep("details")}
              >
                <span className="template-card-head">
                  <span className="template-card-glyph" aria-hidden>
                    {t.glyph}
                  </span>
                  <strong>{t.name}</strong>
                </span>
                <span className="template-card-desc">{t.description}</span>
                <span className="template-card-preview">{t.preview.join("  |  ")}</span>
                {t.includes.length > 0 ? (
                  <span className="template-card-includes">
                    {t.includes.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="project-form-actions">
            <Button variant="ghost" type="button" onClick={() => navigate("/projects")}>
              취소
            </Button>
            <Button type="button" onClick={() => setStep("details")}>
              다음
            </Button>
          </div>
        </>
      ) : (
        <div className="pcreate-details">
          <Card padding="lg">
            <form className="project-create-form" onSubmit={handleSubmit}>
              <TextField
                label="이름 *"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="예: 결제 서비스"
                autoFocus
              />
              <TextField
                label="키 *"
                value={key}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.toUpperCase());
                }}
                placeholder="예: PAY"
                description={`이슈 키는 ${keyPreview}처럼 만들어집니다. 영문 대문자·숫자, 나중에 바꿀 수 없습니다.`}
              />
              <TextArea
                label="설명"
                rows={3}
                placeholder="이 프로젝트가 무엇을 위한 것인지 (선택)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="project-form-actions">
                <Button variant="ghost" type="button" onClick={() => setStep("template")}>
                  뒤로
                </Button>
                <Button variant="ghost" type="button" onClick={() => navigate("/projects")}>
                  취소
                </Button>
                <Button type="submit" disabled={!name.trim() || !key.trim() || submitting}>
                  프로젝트 만들기
                </Button>
              </div>
            </form>
          </Card>
          <aside className="pcreate-preview" aria-label="선택한 템플릿">
            <div className="pcreate-preview-head">
              <span className="template-card-glyph" aria-hidden>
                {template.glyph}
              </span>
              <div>
                <strong>{template.name}</strong>
                <p>{template.description}</p>
              </div>
            </div>
            <dl className="pcreate-preview-facts">
              <dt>보드 컬럼</dt>
              <dd className="pcreate-preview-columns">
                {template.preview.map((col) => (
                  <Lozenge key={col} appearance="neutral">
                    {col}
                  </Lozenge>
                ))}
              </dd>
              <dt>함께 만들어지는 것</dt>
              <dd>
                {template.includes.length > 0 ? (
                  <span className="template-card-includes">
                    {template.includes.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </span>
                ) : (
                  <span className="pcreate-preview-muted">기본 보드만</span>
                )}
              </dd>
              <dt>이슈 키 예</dt>
              <dd>
                <code>{keyPreview}</code>
              </dd>
            </dl>
            <Button variant="subtle" size="small" type="button" onClick={() => setStep("template")}>
              템플릿 변경
            </Button>
          </aside>
        </div>
      )}
    </main>
  );
}
