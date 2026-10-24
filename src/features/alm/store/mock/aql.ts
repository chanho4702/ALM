// localStorage 목업 스토어 — aql (jiraMock.ts에서 분할, 동작 불변)
import type { JiraData } from "../types";
import { type AqlEvalContext, evaluateAql } from "../aql/evaluate";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { parseAndCheck, type AqlValidation, validate as validateAqlInput } from "../aql/validate";
import { type AqlFieldsInfo, type AqlFieldValue, baseFieldInfos, functionInfos, keywordList } from "../aql/fields";
import type { IssuePage } from "./search";
import { load, clone } from "./db";

// ── AQL (ALM Query Language) ─────────────────────────────────

/**
 * 해결(resolution) 값 카탈로그 — 화면 라벨의 원천은 `components/labels.ts`의 `RESOLUTION_LABELS`다.
 * 스토어가 화면 모듈을 import하지 않도록 여기 같은 값을 둔다(둘이 어긋나면 자동완성 후보가 비뚤어진다).
 * 해석 규칙(별칭·대소문자)은 `aql/evaluate.ts`가 서버 `AqlResolver`와 같은 표로 들고 있다.
 */
const AQL_RESOLUTIONS: { id: string; name: string }[] = [
  { id: "done", name: "완료됨" },
  { id: "wont_do", name: "하지 않음" },
  { id: "duplicate", name: "중복" },
  { id: "cannot_reproduce", name: "재현 불가" },
];

/** 이름→id 해석의 원천 — 서버 `AqlResolver`가 DB에서 읽는 것과 같은 레지스트리들 */
export function aqlContext(data: JiraData): AqlEvalContext {
  return {
    currentUserId: CURRENT_USER_ID,
    users: data.users.map((u) => ({ id: u.id, name: u.name })),
    projects: data.projects.map((p) => ({ id: p.id, key: p.key, name: p.name })),
    statuses: data.statusDefs.map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId })),
    categories: data.statusCategories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      order: c.order,
    })),
    types: data.issueTypes.map((t) => ({ id: t.id, name: t.name })),
    priorities: data.priorities.map((p) => ({ id: p.id, name: p.name, order: p.order })),
    sprints: data.sprints.map((s) => ({ id: s.id, name: s.name, state: s.state })),
    versions: data.versions.map((v) => ({ id: v.id, name: v.name })),
    components: data.components.map((c) => ({ id: c.id, name: c.name })),
  };
}

/**
 * AQL 실행 — 파싱 오류는 `AqlError`(message + position)로 던진다(서버 400과 같은 계약).
 * 보관 이슈까지 넘겨야 `archived = true` 검색이 성립한다 — 기본 제외는 실행기가 한다.
 */
export async function queryIssuesAql(
  aql: string,
  paging?: { page?: number; size?: number },
): Promise<IssuePage> {
  const ast = parseAndCheck(aql);
  const data = load();
  const rows = evaluateAql(ast, [...data.issues, ...data.archivedIssues], aqlContext(data));
  const size = Math.max(1, paging?.size ?? 50);
  const page = Math.max(0, paging?.page ?? 0);
  return {
    items: clone(rows.slice(page * size, page * size + size)),
    page,
    size,
    total: rows.length,
    truncated: (page + 1) * size < rows.length,
  };
}

/** 에디터 실시간 검증 — 던지지 않는다 */
export async function validateAql(aql: string): Promise<AqlValidation> {
  return validateAqlInput(aql);
}

/** 자동완성 카탈로그 — 필드·연산자에 더해 레지스트리에서 값 후보를 채운다 */
export async function aqlFields(): Promise<AqlFieldsInfo> {
  const data = load();
  const labels = [...new Set(data.issues.flatMap((i) => i.labels ?? []))].sort();
  const values: Record<string, AqlFieldValue[]> = {
    project: data.projects.map((p) => ({ id: p.key, name: p.key })),
    type: data.issueTypes.map((t) => ({ id: t.id, name: t.name })),
    status: data.statusDefs.map((s) => ({ id: s.id, name: s.name })),
    statusCategory: data.statusCategories.map((c) => ({ id: c.kind, name: c.name })),
    priority: data.priorities.map((p) => ({ id: p.id, name: p.name })),
    resolution: AQL_RESOLUTIONS.map((r) => ({ id: r.id, name: r.name })),
    sprint: data.sprints.map((s) => ({ id: s.id, name: s.name })),
    fixVersion: data.versions.map((v) => ({ id: v.id, name: v.name })),
    component: data.components.map((c) => ({ id: c.id, name: c.name })),
    labels: labels.map((l) => ({ id: l, name: l })),
    // 사용자 후보는 서버 사전에 없다 — 목업은 여기서 채워 REST와 화면 동작을 맞춘다
    assignee: data.users.map((u) => ({ id: u.id, name: u.name })),
    reporter: data.users.map((u) => ({ id: u.id, name: u.name })),
  };
  return {
    fields: baseFieldInfos().map((field) =>
      values[field.name] ? { ...field, values: values[field.name] } : field,
    ),
    functions: functionInfos(),
    keywords: keywordList(),
  };
}

/**
 * 테스트 전용 — 지금 저장된 편집 버전. 동시 편집과 무관한 테스트가 "최신 버전 기준으로 저장"할 때만 쓴다
 * (화면은 편집을 시작할 때 들고 있던 버전을 보낸다 — 충돌 의미는 jiraStore.concurrency 테스트가 검증한다).
 */
export function __versionForTest(kind: "issue" | "sprint" | "project", id: string): number {
  const data = load();
  const row =
    kind === "issue"
      ? data.issues.find((i) => i.id === id)
      : kind === "sprint"
        ? data.sprints.find((s) => s.id === id)
        : data.projects.find((p) => p.id === id);
  // 없는 대상은 0 — "찾을 수 없습니다" 거부는 스토어 함수가 내야 테스트가 그 의미를 본다
  return row?.version ?? 0;
}
