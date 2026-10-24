/**
 * 데이터 계층 파사드 — 화면은 이 모듈만 import한다(불변 규칙 1).
 *
 * - 목업(`jiraMock.ts`, localStorage): 테스트·목업 개발의 기본.
 * - REST(`jiraApi.ts`, alm-backend): 프로덕션 빌드 또는 `VITE_ALM_DATA=rest`. 파사드의 모든 함수가 REST로 간다.
 *
 * 구현은 **빌드 시점에** 고른다 — `@alm-store-impl` 별칭을 vite.config.ts가 둘 중 하나로 푼다(vitest는 항상 목업).
 * 그래서 프로덕션 번들에는 목업·시드·샘플 데이터가 실리지 않는다. 런타임에 섞어 쓰던 `{...mock, ...rest}` 폴백은 없다.
 *
 * 시그니처는 목업이 정본이다(`typeof mock`). REST가 같은 이름·같은 계약을 갖는지는 아래 타입 검사가 전부 본다 —
 * REST에 함수가 빠지거나 시그니처가 갈라지면 typecheck가 깨진다.
 */
import * as impl from "@alm-store-impl";
import type * as mock from "./jiraMock";

export type { SavedFilter, SavedFilterInput } from "./uiStore";
export type {
  IssueAggregate,
  IssueAggregateGroup,
  IssueSearchCriteria,
  IssueSort,
  IssueSortField,
} from "./issueSearch";
export type { ProjectPatch,
  ProjectMemberView,
  VersionInput,
  SprintPlanPatch,
  IssueLinkView,
  ImportResult,
  IssuePage,
  WatchersView,
  BulkIssuePatch,
  BulkIssueTarget,
  BulkDeleteTarget,
  BulkResult,
  ResolvedSettings,
  ChangeFilter,
  ChangeWindow,
} from "./jiraMock";

/** 목업에만 있는 테스트 훅·내부 값 — REST 계약에서 뺀다(REST 빌드에서 이 이름들은 undefined다) */
type MockOnly =
  | "__setAgentMockScenario"
  | "__setMockOfficeStream"
  | "__emitProjectStreamEvent"
  | "__simulateRemoteIssueChange"
  | "__setMockProjectStream"
  | "__ingestMockCommits"
  | "__versionForTest"
  | "ISSUE_CONFLICT_MESSAGE"
  | "AVATAR_MAX_BYTES"
  | "SPRINT_DELETE_PLANNED_ONLY"
  | "CLONE_TITLE_PREFIX";

/** 파사드 계약 = 목업 모듈의 공개 표면(테스트 훅 제외) */
type StoreContract = Omit<typeof mock, MockOnly> & { AVATAR_MAX_BYTES: number };
type Conforms<T extends StoreContract> = T;
/** 컴파일 타임 검사 — REST 어댑터가 목업 계약을 전부 만족해야 한다(값 없음) */
export type RestConformsToStoreContract = Conforms<typeof import("./jiraApi")>;

/** 테스트(vitest)는 항상 목업. 프로덕션 빌드는 REST, 개발은 `VITE_ALM_DATA=rest`로 백엔드에 붙인다 */
export const USE_REST = impl.STORE_MODE === "rest";

export const __resetForTest = impl.__resetForTest;
export const listUsers = impl.listUsers;
export const getCurrentUser = impl.getCurrentUser;
export const getMyOrgProfile = impl.getMyOrgProfile;
export const listProjects = impl.listProjects;
export const createProject = impl.createProject;
export const updateProject = impl.updateProject;
export const deleteProject = impl.deleteProject;
export const ISSUE_TYPES_CHANGED_EVENT = impl.ISSUE_TYPES_CHANGED_EVENT;
export const listProjectMembers = impl.listProjectMembers;
export const addProjectMember = impl.addProjectMember;
export const updateProjectMemberRole = impl.updateProjectMemberRole;
export const removeProjectMember = impl.removeProjectMember;
export const getMyProjectRole = impl.getMyProjectRole;
export const hasAnyProjectAdmin = impl.hasAnyProjectAdmin;
export const listAttachments = impl.listAttachments;
export const uploadAttachment = impl.uploadAttachment;
export const downloadAttachment = impl.downloadAttachment;
/** 이미지 첨부 미리보기 바이트(F-09) — png·jpeg·gif·webp만 */
export const inlineAttachment = impl.inlineAttachment;
export const deleteAttachment = impl.deleteAttachment;
export const listVersions = impl.listVersions;
export const createVersion = impl.createVersion;
export const updateVersion = impl.updateVersion;
export const releaseVersion = impl.releaseVersion;
export const archiveVersion = impl.archiveVersion;
export const deleteVersion = impl.deleteVersion;
export const listSprints = impl.listSprints;
export const createSprint = impl.createSprint;
export const updateSprint = impl.updateSprint;
export const startSprint = impl.startSprint;
export const completeSprint = impl.completeSprint;
/** 예정 스프린트 삭제(F-10) — 관리자만, 이슈는 백로그 맨 위로 */
export const deleteSprint = impl.deleteSprint;
export const listIssues = impl.listIssues;
/** 교차 프로젝트 검색(스마트/기본 쿼리) — 서버 페이징, total은 조건 전체 건수 */
export const queryIssuesPage = impl.queryIssuesPage;
/** 서버 검색·집계·라벨 계약(issueSearch.ts) — 홈·대시보드·목록이 이슈 전량을 읽지 않게 한다 */
export const findIssues = impl.findIssues;
export const aggregateIssues = impl.aggregateIssues;
export const listProjectLabels = impl.listProjectLabels;
export const searchIssues = impl.searchIssues;
export const getIssueByKey = impl.getIssueByKey;
export const createIssue = impl.createIssue;
export const updateIssue = impl.updateIssue;
/** 이슈 복제(F-11) — 새 이슈를 돌려준다(처음 상태, 원본과 "복제" 링크) */
export const cloneIssue = impl.cloneIssue;
export const moveIssue = impl.moveIssue;
export const listWorklogs = impl.listWorklogs;
export const addWorklog = impl.addWorklog;
export const deleteWorklog = impl.deleteWorklog;
export const setIssueParent = impl.setIssueParent;
export const listChildren = impl.listChildren;
/** 자식 한 페이지 + truncated — 이슈 상세의 "N건 중 M건" 표시용 */
export const listChildrenPage = impl.listChildrenPage;
/** 상위 항목 경로(루트 먼저) — 이슈 상세의 경로 표시용, 프로젝트 전체를 읽지 않는다 */
export const listIssueAncestors = impl.listIssueAncestors;
export const addIssueLink = impl.addIssueLink;
export const removeIssueLink = impl.removeIssueLink;
/** 웹 링크(F-08) — PR·커밋·문서 주소. 같은 URL은 기존 것을 돌려준다(created: false) */
export const listWebLinks = impl.listWebLinks;
export const addWebLink = impl.addWebLink;
export const removeWebLink = impl.removeWebLink;
export const listIssueLinks = impl.listIssueLinks;
export const rankIssue = impl.rankIssue;
export const importIssues = impl.importIssues;
export const listAuditLog = impl.listAuditLog;
export const systemStats = impl.systemStats;
export const fetchAgentPersonas = impl.fetchAgentPersonas;
export const fetchOffice = impl.fetchOffice;
export const fetchPersonaActivity = impl.fetchPersonaActivity;
export const fetchAgentRuns = impl.fetchAgentRuns;
/** run 단건(P4c) — 구 백엔드는 404/405라 화면이 목록 조회로 폴백한다 */
export const fetchAgentRun = impl.fetchAgentRun;
/** 사무실 무효화 스트림(P4c) — 목업 테스트는 스트림 없음(`unsupported`)이 기본 */
export const streamOffice = impl.streamOffice;
export const cancelRun = impl.cancelRun;
export const resumeRun = impl.resumeRun;
export const fetchAgentGates = impl.fetchAgentGates;
export const approveGate = impl.approveGate;
export const rejectGate = impl.rejectGate;
export const createMeeting = impl.createMeeting;
/** AI 팀 설정(P3f·P3h) — 권한 힌트·직원·토큰·프로젝트 LLM 키 */
export const fetchAgentPermissions = impl.fetchAgentPermissions;
export const listAgentTeamPersonas = impl.listAgentTeamPersonas;
export const createAgentPersona = impl.createAgentPersona;
export const setAgentPersonaActive = impl.setAgentPersonaActive;
export const fetchAgentPersonaDetail = impl.fetchAgentPersonaDetail;
export const updateAgentPersona = impl.updateAgentPersona;
export const listAgentTokens = impl.listAgentTokens;
export const issueAgentToken = impl.issueAgentToken;
export const revokeAgentToken = impl.revokeAgentToken;
export const fetchProjectCredential = impl.fetchProjectCredential;
export const saveProjectCredential = impl.saveProjectCredential;
export const deleteProjectCredential = impl.deleteProjectCredential;
/** 실행 위치·러너(P4a AGP-69) — 조회는 구 백엔드면 null(지원 안 함) */
export const fetchExecutionSite = impl.fetchExecutionSite;
export const saveExecutionSite = impl.saveExecutionSite;
export const listAgentRunners = impl.listAgentRunners;
export const issueAgentRunner = impl.issueAgentRunner;
export const revokeAgentRunner = impl.revokeAgentRunner;
/** 리뷰어 지정·실행 중 지시(P4b AGP-59·67) — 조회는 구 백엔드면 null(지원 안 함) */
export const fetchReviewSetting = impl.fetchReviewSetting;
export const saveReviewSetting = impl.saveReviewSetting;
export const clearReviewSetting = impl.clearReviewSetting;
export const fetchRunDirectives = impl.fetchRunDirectives;
export const sendRunDirective = impl.sendRunDirective;
/** AI 사무실 1:1 대화(P3g) — USER run·수다·대화 기록 */
export const createAgentRun = impl.createAgentRun;
export const sendPersonaChat = impl.sendPersonaChat;
export const fetchPersonaDialog = impl.fetchPersonaDialog;
export const savePersonaDialog = impl.savePersonaDialog;
/** 테스트 전용 — 목업의 권한·키 시나리오 전환(REST에는 없다) */
export const __setAgentMockScenario = impl.__setAgentMockScenario;
/** 테스트 전용 — 목업에 저장된 현재 편집 버전(동시 편집과 무관한 테스트의 저장용) */
export const __versionForTest = impl.__versionForTest;
export const __setMockOfficeStream = impl.__setMockOfficeStream;
/** 프로젝트 실시간 스트림(SSE, fetch 스트리밍) — 무효화 신호만, 재연결은 화면 훅(useReconnectingStream) */
export const streamProject = impl.streamProject;
/** 목업 전용(REST 빌드에서는 undefined) — 테스트·개발 화면에서 "다른 사람의 변경"을 흉내 낸다 */
export const __emitProjectStreamEvent = (impl as Partial<typeof mock>).__emitProjectStreamEvent;
export const __simulateRemoteIssueChange = (impl as Partial<typeof mock>).__simulateRemoteIssueChange;
/** 목업 전용 — 커밋 수집 대역(테스트·화면 데모). REST 빌드에서 undefined */
export const __ingestMockCommits = (impl as Partial<typeof mock>).__ingestMockCommits;
export const __setMockProjectStream = (impl as Partial<typeof mock>).__setMockProjectStream;
export type { AgentMockScenario } from "./jiraMock";
export const listIssuesPage = impl.listIssuesPage;
export const listWatchers = impl.listWatchers;
export const watchIssue = impl.watchIssue;
export const unwatchIssue = impl.unwatchIssue;
export const bulkUpdateIssues = impl.bulkUpdateIssues;
export const bulkDeleteIssues = impl.bulkDeleteIssues;
export const deleteIssue = impl.deleteIssue;
export const listComments = impl.listComments;
export const addComment = impl.addComment;
export const updateComment = impl.updateComment;
export const deleteComment = impl.deleteComment;
export const resolveSettings = impl.resolveSettings;
export const listProjectStatuses = impl.listProjectStatuses;
export const statusMetaByProject = impl.statusMetaByProject;
export const listAllStatuses = impl.listAllStatuses;
export const listSchemes = impl.listSchemes;
export const countSchemeProjects = impl.countSchemeProjects;
export const createScheme = impl.createScheme;
export const updateScheme = impl.updateScheme;
export const deleteScheme = impl.deleteScheme;
export const setDefaultScheme = impl.setDefaultScheme;
export const assignScheme = impl.assignScheme;
export const setProjectCustom = impl.setProjectCustom;
export const updateProjectCustomSettings = impl.updateProjectCustomSettings;
export const listStatusCategories = impl.listStatusCategories;
export const createStatusCategory = impl.createStatusCategory;
export const updateStatusCategory = impl.updateStatusCategory;
export const moveStatusCategory = impl.moveStatusCategory;
export const deleteStatusCategory = impl.deleteStatusCategory;
export const listStatusDefs = impl.listStatusDefs;
export const statusDefUsage = impl.statusDefUsage;
export const createStatusDef = impl.createStatusDef;
export const updateStatusDef = impl.updateStatusDef;
export const deleteStatusDef = impl.deleteStatusDef;
export const listIssueTypes = impl.listIssueTypes;
export const issueTypeUsage = impl.issueTypeUsage;
export const createIssueType = impl.createIssueType;
export const updateIssueType = impl.updateIssueType;
export const moveIssueType = impl.moveIssueType;
export const deleteIssueType = impl.deleteIssueType;
export const listBoards = impl.listBoards;
export const getBoard = impl.getBoard;
export const createBoard = impl.createBoard;
export const updateBoard = impl.updateBoard;
export const deleteBoard = impl.deleteBoard;
export const listBoardIssues = impl.listBoardIssues;
export const listNotifications = impl.listNotifications;
export const markNotificationRead = impl.markNotificationRead;
export const markAllNotificationsRead = impl.markAllNotificationsRead;
export const getPlanningSettings = impl.getPlanningSettings;
export const updatePlanningSettings = impl.updatePlanningSettings;
export const listNotificationInbox = impl.listNotificationInbox;
export const snoozeNotification = impl.snoozeNotification;
export const unsnoozeNotification = impl.unsnoozeNotification;
export const archiveNotification = impl.archiveNotification;
export const unarchiveNotification = impl.unarchiveNotification;
export const bulkNotifications = impl.bulkNotifications;
export const listProjectChanges = impl.listProjectChanges;
/** 변경 이력 + 잘림 여부(서버 상한 20000) — 리포트가 since 창으로 부른다 */
export const listProjectChangeWindow = impl.listProjectChangeWindow;
export const CHANGE_HISTORY_MAX_LIMIT = impl.CHANGE_HISTORY_MAX_LIMIT;
export const listActivity = impl.listActivity;
export const DEFAULT_PREFERENCES = impl.DEFAULT_PREFERENCES;
export const getMyPreferences = impl.getMyPreferences;
export const saveMyPreferences = impl.saveMyPreferences;
export const AVATAR_CHANGED_EVENT = impl.AVATAR_CHANGED_EVENT;
export const uploadMyAvatar = impl.uploadMyAvatar;
export const removeMyAvatar = impl.removeMyAvatar;
/** 업로드 상한 — 목업 200KB(localStorage), REST 2MB(서버). 화면 안내 문구가 이 값을 읽는다 */
export const AVATAR_MAX_BYTES = impl.AVATAR_MAX_BYTES;
export const formatAvatarLimit = impl.formatAvatarLimit;
export const listProjectShortcuts = impl.listProjectShortcuts;
export const addProjectShortcut = impl.addProjectShortcut;
export const updateProjectShortcut = impl.updateProjectShortcut;
export const removeProjectShortcut = impl.removeProjectShortcut;
export const getBanner = impl.getBanner;
export const saveBanner = impl.saveBanner;
export const PRIORITIES_CHANGED_EVENT = impl.PRIORITIES_CHANGED_EVENT;
export const listPriorities = impl.listPriorities;
export const priorityUsage = impl.priorityUsage;
export const createPriority = impl.createPriority;
export const updatePriority = impl.updatePriority;
export const movePriority = impl.movePriority;
export const deletePriority = impl.deletePriority;
export const LINK_TYPES_CHANGED_EVENT = impl.LINK_TYPES_CHANGED_EVENT;
export const listLinkTypes = impl.listLinkTypes;
export const linkTypeUsage = impl.linkTypeUsage;
export const createLinkType = impl.createLinkType;
export const updateLinkType = impl.updateLinkType;
export const moveLinkType = impl.moveLinkType;
export const deleteLinkType = impl.deleteLinkType;
export const archiveIssue = impl.archiveIssue;
export const restoreIssue = impl.restoreIssue;
export const listArchivedIssues = impl.listArchivedIssues;
export const archiveProject = impl.archiveProject;
export const unarchiveProject = impl.unarchiveProject;
export const listTrashedProjects = impl.listTrashedProjects;
export const restoreProject = impl.restoreProject;
export const purgeProject = impl.purgeProject;
export const listComponents = impl.listComponents;
export const createComponent = impl.createComponent;
export const updateComponent = impl.updateComponent;
export const deleteComponent = impl.deleteComponent;
export const listDashboards = impl.listDashboards;
export const getDashboard = impl.getDashboard;
export const createDashboard = impl.createDashboard;
export const updateDashboard = impl.updateDashboard;
export const deleteDashboard = impl.deleteDashboard;
export const listProjectWorklogs = impl.listProjectWorklogs;
/**
 * 저장 필터 — 목업은 localStorage(`alm.jira.ui.v1`), REST는 `/api/alm/me/filters`(본인 소유만).
 * 화면(사이드바·검색)은 uiStore를 직접 만지지 않고 이 넷만 쓴다.
 */
export const listSavedFilters = impl.listSavedFilters;
export const createSavedFilter = impl.createSavedFilter;
export const updateSavedFilter = impl.updateSavedFilter;
export const deleteSavedFilter = impl.deleteSavedFilter;
/** 남이 공유한 저장 필터(F-12) — 실행만 하고 고치거나 지울 수 없다 */
export const listSharedFilters = impl.listSharedFilters;
/** AQL — 목업은 `store/aql/evaluate.ts`로 메모리 이슈에, REST는 `POST /api/alm/issues/query`로 실행한다 */
export const queryIssuesAql = impl.queryIssuesAql;
export const validateAql = impl.validateAql;
export const aqlFields = impl.aqlFields;
/** 워크플로 엔진(웨이브 A) — 지금 갈 수 있는 전환(못 하는 것도 이유와 함께)과 전환 실행(전환 화면 값·코멘트 포함) */
export const listIssueTransitions = impl.listIssueTransitions;
export const transitionIssue = impl.transitionIssue;
/** 플래그(D2) — 버전을 올리지 않는다. 이유를 주면 코멘트가 남는다 */
export const setIssueFlag = impl.setIssueFlag;
/** 추정 합계·속도(D, V30) */
export const getEstimationSummary = impl.getEstimationSummary;
export const getVelocity = impl.getVelocity;
/** 저장된 보기(D1, V31) — 필터 + 표시 옵션, 개인/프로젝트 공유 */
export const listMyViews = impl.listMyViews;
export const listProjectViews = impl.listProjectViews;
export const getView = impl.getView;
export const createView = impl.createView;
export const updateView = impl.updateView;
export const deleteView = impl.deleteView;
/** 트리아지(V35) — 설정·대기열·수락/중복/거절/보류 */
export const getTriageSettings = impl.getTriageSettings;
export const saveTriageSettings = impl.saveTriageSettings;
export const listTriage = impl.listTriage;
export const sendToTriage = impl.sendToTriage;
export const acceptTriage = impl.acceptTriage;
export const declineTriage = impl.declineTriage;
export const duplicateTriage = impl.duplicateTriage;
export const snoozeTriage = impl.snoozeTriage;
/** 자동화 규칙(V36·V37) — 프로젝트 관리자 전용 */
export const listAutomationRules = impl.listAutomationRules;
export const getAutomationRule = impl.getAutomationRule;
export const createAutomationRule = impl.createAutomationRule;
export const updateAutomationRule = impl.updateAutomationRule;
export const deleteAutomationRule = impl.deleteAutomationRule;
export const listAutomationRuleRuns = impl.listAutomationRuleRuns;
export const listProjectAutomationRuns = impl.listProjectAutomationRuns;
/**
 * 개발 기록(V41) — 저장소 등록(통째 교체·최대 20, 관리자), 이슈 개발 정보(커밋·PR·요약), 프로젝트 최근 커밋(커서).
 * 수집은 화면 몫이 아니다(CLI·MCP의 `POST /api/alm/dev/commits`).
 */
export const listProjectRepositories = impl.listProjectRepositories;
export const saveProjectRepositories = impl.saveProjectRepositories;
export const getIssueDevelopment = impl.getIssueDevelopment;
export const listProjectCommits = impl.listProjectCommits;
