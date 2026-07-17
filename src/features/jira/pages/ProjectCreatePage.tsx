import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button, Card, PageHeader, TextArea, TextField, TopBar, useToast } from "@chanho/react";
import { createProject } from "../store/jiraStore";
import { ThemeToggle } from "../components/ThemeToggle";

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

/** 전용 생성 페이지 — 생성 즉시 새 프로젝트 보드로 이동한다 */
export function ProjectCreatePage({ onProjectsChanged }: ProjectCreatePageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  /** 키를 직접 만졌으면 이름 기반 자동 제안을 멈춘다 */
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");

  const handleNameChange = (next: string) => {
    setName(next);
    if (!keyTouched) setKey(suggestKey(next));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const project = await createProject({ key, name, description });
      toast({ title: `프로젝트 ${project.key}를 만들었습니다`, appearance: "success" });
      await onProjectsChanged();
      navigate(`/projects/${project.id}/board`);
    } catch (error) {
      toast({
        title: "프로젝트 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <div className="project-list-layout">
      <TopBar brand={<span className="jira-brand">ALM</span>} actions={<ThemeToggle />} />
      <main className="project-list-content project-form-content">
        <PageHeader title="새 프로젝트" />
        <Card padding="lg">
          <form className="project-create-form" onSubmit={handleSubmit}>
            <TextField
              label="이름"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="예: 결제 서비스"
            />
            <TextField
              label="키"
              value={key}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toUpperCase());
              }}
              placeholder="예: PAY"
              description="이슈 번호의 접두어가 됩니다 (예: PAY-1). 대문자로 자동 변환됩니다."
            />
            <TextArea
              label="설명"
              rows={3}
              placeholder="프로젝트 설명 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="project-form-actions">
              <Button variant="ghost" type="button" onClick={() => navigate("/projects")}>
                취소
              </Button>
              <Button type="submit" disabled={!name.trim() || !key.trim()}>
                만들기
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
