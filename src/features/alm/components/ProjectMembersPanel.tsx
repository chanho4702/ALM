import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Dropdown, Select, Table, TextField, useToast } from "@chanho/react";
import { UserPlus } from "lucide-react";
import type { ProjectRole, User } from "../store/types";
import {
  addProjectMember,
  getMyProjectRole,
  listProjectMembers,
  listUsers,
  removeProjectMember,
  updateProjectMemberRole,
  type ProjectMemberView,
} from "../store/jiraStore";
import { ORG_ADMIN_BASE } from "./SettingsSideNav";
import { UserAvatar } from "./UserAvatar";

/** org-service GrantRole과 같은 3단계 — 화면 문구만 한국어다 */
const ROLE_OPTIONS: { value: ProjectRole; label: string; hint: string }[] = [
  { value: "admin", label: "관리자", hint: "설정 변경과 멤버 관리" },
  { value: "editor", label: "편집자", hint: "이슈 생성과 수정" },
  { value: "viewer", label: "뷰어", hint: "읽기만" },
];

const ROLE_LABELS: Record<ProjectRole, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "뷰어",
};

const UNSELECTED = "none"; // Select는 빈 문자열 value를 쓰지 않는다(DS 함정)

/** 검색어를 칠 때마다 서버를 부르지 않는다 — 마지막 입력에서 이만큼 쉬면 한 번 부른다 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * 초대 화면 프리셋 링크(패키지 0.1.2) — 초대 폼이 이 프로젝트 권한을 미리 담은 채 열린다.
 * `resourceId`는 org-service가 grant에 쓰는 값이고, REST 모드의 프로젝트 id가 곧 그 값이다.
 * 패키지가 쿼리를 읽자마자 지우므로(replace) 새로고침·뒤로가기에 프리셋이 되살아나지 않는다.
 */
const inviteHref = (projectId: string) =>
  `${ORG_ADMIN_BASE}/invitations?scope=PROJECT&resourceId=${encodeURIComponent(projectId)}&role=EDITOR`;

/**
 * 프로젝트 멤버·역할 — 권한의 단일 진실 소스는 org-service이고 이 화면은 그 모델(VIEWER/EDITOR/
 * ADMIN)을 그대로 다룬다. 목업 모드에서는 스토어가 같은 규칙을 흉내낸다.
 */
export function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<ProjectMemberView[]>([]);
  const [directory, setDirectory] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<ProjectRole | null>(null);
  const [candidate, setCandidate] = useState<string>(UNSELECTED);
  const [newRole, setNewRole] = useState<ProjectRole>("editor");
  const [search, setSearch] = useState("");
  const toast = useToast();
  const navigate = useNavigate();

  // 프로젝트를 바꾸는 중 먼저 시작한 조회가 늦게 끝나면 이전 프로젝트의 멤버·역할로 화면을 덮는다.
  // 세대 번호로 마지막 요청만 반영한다 — 역할이 뒤바뀌면 관리 버튼이 잘못 열린다.
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++generation.current;
    const [memberList, role] = await Promise.all([
      listProjectMembers(projectId),
      getMyProjectRole(projectId),
    ]);
    if (mine !== generation.current) return;
    setMembers(memberList);
    setMyRole(role);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 디렉터리는 검색어로 서버에서 좁힌다(`/api/org/members?q=`) — 전체를 받아 화면에서 자르면
  // 사용자가 수천 명일 때 선택기가 못 쓰게 된다. 늦게 도착한 응답이 최신 결과를 덮지 않도록
  // 같은 세대 번호로 막는다.
  const directoryGeneration = useRef(0);
  useEffect(() => {
    const mine = ++directoryGeneration.current;
    const timer = setTimeout(() => {
      void listUsers({ q: search }).then((rows) => {
        if (mine === directoryGeneration.current) setDirectory(rows);
      });
    }, search === "" ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /** 실패는 사유를 그대로 보여준다 — 마지막 관리자 보호처럼 사용자가 알아야 할 규칙이 있다 */
  const run = async (failTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const canManage = myRole === "admin";
  const memberIds = new Set(members.map((member) => member.user.id));
  const addable = directory.filter((user) => !memberIds.has(user.id));

  // 검색이 좁아져 고른 사람이 목록에서 사라지면 선택을 비운다 — Select에 없는 value를 남기면
  // 표시가 비고 "멤버 추가"가 사라진 사람을 그대로 보낸다.
  useEffect(() => {
    if (candidate !== UNSELECTED && !addable.some((user) => user.id === candidate)) {
      setCandidate(UNSELECTED);
    }
  }, [addable, candidate]);

  return (
    <div className="project-settings">
      <Card padding="lg" title="멤버">
        <Table
          aria-label="프로젝트 멤버"
          columns={[
            { key: "name", header: "사용자" },
            { key: "role", header: "역할" },
            { key: "actions", header: "" },
          ]}
          rows={members.map((member) => ({
            id: member.user.id,
            name: (
              <span className="member-name">
                <UserAvatar user={member.user} size="small" />
                {member.user.name}
              </span>
            ),
            // 행마다 라벨 붙은 Select를 놓으면 라벨이 반복돼 표가 시끄럽다 — 버튼 + 메뉴로 간다
            role: canManage ? (
              <Dropdown
                trigger={
                  <Button variant="subtle" size="small" aria-label={`${member.user.name} 역할`}>
                    {ROLE_LABELS[member.role]}
                  </Button>
                }
                items={ROLE_OPTIONS.map((option) => ({
                  label: option.label,
                  disabled: option.value === member.role,
                  onSelect: () =>
                    void run("역할 변경 실패", () =>
                      updateProjectMemberRole(projectId, member.user.id, option.value),
                    ),
                }))}
              />
            ) : (
              ROLE_LABELS[member.role]
            ),
            actions: canManage ? (
              <Button
                variant="subtle"
                size="small"
                aria-label={`${member.user.name} 내보내기`}
                onClick={() =>
                  void run("멤버 내보내기 실패", () =>
                    removeProjectMember(projectId, member.user.id),
                  )
                }
              >
                내보내기
              </Button>
            ) : null,
          }))}
        />
      </Card>

      {canManage ? (
        <Card
          padding="lg"
          title="멤버 추가"
          headerActions={
            // 이 카드는 프로젝트 관리자에게만 보인다(canManage). 설계 §3.2대로 리소스 ADMIN도
            // 초대할 수 있으므로 전역 관리자로 좁히지 않는다 — 프리셋 범위는 서버가 강제한다.
            <Button
              variant="subtle"
              size="small"
              iconBefore={<UserPlus size={16} aria-hidden />}
              onClick={() => navigate(inviteHref(projectId))}
            >
              초대하기
            </Button>
          }
        >
          <div className="member-add">
            <TextField
              label="사용자 검색"
              placeholder="이름 또는 이메일"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="추가할 사용자"
              value={candidate}
              options={[
                { value: UNSELECTED, label: "사용자 선택" },
                ...addable.map((user) => ({ value: user.id, label: user.name })),
              ]}
              onValueChange={setCandidate}
            />
            <Select
              label="역할"
              value={newRole}
              options={ROLE_OPTIONS.map((option) => ({
                value: option.value,
                label: `${option.label} — ${option.hint}`,
              }))}
              onValueChange={(next) => setNewRole(next as ProjectRole)}
            />
            <Button
              disabled={candidate === UNSELECTED}
              onClick={() =>
                void run("멤버 추가 실패", async () => {
                  await addProjectMember(projectId, candidate, newRole);
                  setCandidate(UNSELECTED);
                })
              }
            >
              멤버 추가
            </Button>
          </div>
          {addable.length === 0 ? (
            <p className="dash-empty">
              {search.trim() === ""
                ? "디렉터리의 모든 사용자가 이미 멤버입니다."
                : "검색 결과 중 추가할 수 있는 사용자가 없습니다. 아직 계정이 없다면 초대하세요."}
            </p>
          ) : null}
        </Card>
      ) : (
        <p className="dash-empty">멤버를 관리하려면 이 프로젝트의 관리자여야 합니다.</p>
      )}
    </div>
  );
}
