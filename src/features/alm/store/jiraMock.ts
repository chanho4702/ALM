// localStorage 목업 스토어 — 테스트·목업 개발의 데이터 계층이자 파사드 계약(시그니처)의 정본. 프로덕션 번들에는 들어가지 않는다.
//
// 도메인별 구현은 ./mock/*.ts — 이 파일은 공개 표면(배럴)만 유지한다. 상태(캐시·시드)는 ./mock/db.ts 한 곳에 있다.
export {
  __resetForTest,
  STORE_MODE,
} from "./mock/db";
export {
  listUsers,
  getMyOrgProfile,
  getCurrentUser,
} from "./mock/users";
export {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  listTrashedProjects,
  restoreProject,
  purgeProject,
} from "./mock/projects";
export type {
  ProjectPatch,
} from "./mock/projects";
export {
  listProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  getMyProjectRole,
  hasAnyProjectAdmin,
} from "./mock/members";
export type {
  ProjectMemberView,
} from "./mock/members";
export {
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  inlineAttachment,
  deleteAttachment,
} from "./mock/attachments";
export {
  listVersions,
  createVersion,
  updateVersion,
  releaseVersion,
  archiveVersion,
  deleteVersion,
} from "./mock/versions";
export type {
  VersionInput,
} from "./mock/versions";
export {
  listSprints,
  createSprint,
  updateSprint,
  startSprint,
  completeSprint,
  deleteSprint,
  SPRINT_DELETE_PLANNED_ONLY,
} from "./mock/sprints";
export type {
  SprintPlanPatch,
} from "./mock/sprints";
export {
  listIssues,
  queryIssuesPage,
  searchIssues,
  getIssueByKey,
  createIssue,
  updateIssue,
  ISSUE_CONFLICT_MESSAGE,
  moveIssue,
} from "./mock/issues";
export {
  listWorklogs,
  addWorklog,
  deleteWorklog,
} from "./mock/worklogs";
export {
  setIssueParent,
  listIssueAncestors,
  listChildrenPage,
  listChildren,
  addIssueLink,
  listWebLinks,
  addWebLink,
  removeWebLink,
  cloneIssue,
  CLONE_TITLE_PREFIX,
  removeIssueLink,
  listIssueLinks,
  rankIssue,
} from "./mock/relations";
export type {
  IssueLinkView,
} from "./mock/relations";
export {
  importIssues,
  bulkUpdateIssues,
  bulkDeleteIssues,
  deleteIssue,
} from "./mock/issueOps";
export type {
  ImportResult,
  BulkIssuePatch,
  BulkIssueTarget,
  BulkDeleteTarget,
  BulkResult,
} from "./mock/issueOps";
export {
  listAuditLog,
  systemStats,
  fetchAgentPersonas,
} from "./mock/admin";
export {
  fetchOffice,
  fetchPersonaActivity,
} from "./mock/office";
export {
  fetchAgentRuns,
  fetchAgentRun,
  __setMockOfficeStream,
  streamOffice,
  cancelRun,
  resumeRun,
  fetchAgentGates,
  approveGate,
  rejectGate,
  createMeeting,
} from "./mock/officeRuns";
export {
  __setAgentMockScenario,
  fetchAgentPermissions,
  listAgentTeamPersonas,
  createAgentPersona,
  setAgentPersonaActive,
  fetchAgentPersonaDetail,
  updateAgentPersona,
  listAgentTokens,
  issueAgentToken,
  revokeAgentToken,
  fetchProjectCredential,
  saveProjectCredential,
  deleteProjectCredential,
  fetchExecutionSite,
  saveExecutionSite,
  listAgentRunners,
  issueAgentRunner,
  revokeAgentRunner,
  fetchReviewSetting,
  saveReviewSetting,
  clearReviewSetting,
} from "./mock/aiTeam";
export type {
  AgentMockScenario,
} from "./mock/aiTeam";
export {
  fetchRunDirectives,
  sendRunDirective,
  createAgentRun,
  sendPersonaChat,
  fetchPersonaDialog,
  savePersonaDialog,
} from "./mock/officeDialog";
export {
  listIssuesPage,
  findIssues,
  aggregateIssues,
  listProjectLabels,
} from "./mock/search";
export type {
  IssuePage,
} from "./mock/search";
export {
  listWatchers,
  watchIssue,
  unwatchIssue,
} from "./mock/watchers";
export type {
  WatchersView,
} from "./mock/watchers";
export {
  listComments,
  addComment,
  updateComment,
  deleteComment,
  listActivity,
} from "./mock/collab";
export {
  resolveSettings,
  listProjectStatuses,
  statusMetaByProject,
  listAllStatuses,
  listSchemes,
  countSchemeProjects,
  createScheme,
  updateScheme,
  deleteScheme,
  setDefaultScheme,
  assignScheme,
  setProjectCustom,
  updateProjectCustomSettings,
} from "./mock/settings";
export type {
  ResolvedSettings,
} from "./mock/settings";
export {
  listStatusCategories,
  createStatusCategory,
  updateStatusCategory,
  moveStatusCategory,
  deleteStatusCategory,
  listStatusDefs,
  statusDefUsage,
  createStatusDef,
  updateStatusDef,
  deleteStatusDef,
  listIssueTypes,
  issueTypeUsage,
  createIssueType,
  updateIssueType,
  moveIssueType,
  deleteIssueType,
  listPriorities,
  priorityUsage,
  createPriority,
  updatePriority,
  movePriority,
  deletePriority,
  listLinkTypes,
  linkTypeUsage,
  createLinkType,
  updateLinkType,
  moveLinkType,
  deleteLinkType,
} from "./mock/registries";
export {
  listDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  listProjectWorklogs,
} from "./mock/dashboards";
export {
  listComponents,
  createComponent,
  updateComponent,
  deleteComponent,
} from "./mock/components";
export {
  archiveIssue,
  restoreIssue,
  listArchivedIssues,
  archiveProject,
  unarchiveProject,
} from "./mock/archive";
export {
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  listBoardIssues,
} from "./mock/boards";
export {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./mock/notifications";
export {
  listProjectChangeWindow,
  listProjectChanges,
} from "./mock/history";
export type {
  ChangeFilter,
  ChangeWindow,
} from "./mock/history";
export {
  getMyPreferences,
  AVATAR_MAX_BYTES,
  uploadMyAvatar,
  removeMyAvatar,
  saveMyPreferences,
  listProjectShortcuts,
  addProjectShortcut,
  updateProjectShortcut,
  removeProjectShortcut,
  getBanner,
  saveBanner,
} from "./mock/personal";
export {
  queryIssuesAql,
  validateAql,
  aqlFields,
  __versionForTest,
} from "./mock/aql";

// ── 저장 필터 ────────────────────────────────────────────────

/**
 * 저장 필터의 목업 절반 — 구현은 `uiStore`(localStorage `alm.jira.ui.v1`)가 갖고 있고 여기서 내보내기만 한다.
 * REST 어댑터는 같은 이름으로 `/api/alm/me/filters`를 부른다. 화면은 둘 다 `jiraStore` 파사드로만 만난다.
 */
export {
  listSavedFilters,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  listSharedFilters,
} from "./uiStore";

export type { SavedFilter, SavedFilterInput } from "./uiStore";

// 공용 상수·사전 검증(shared.ts) — 파사드 계약에 같이 실린다
export {
  AVATAR_CHANGED_EVENT,
  AVATAR_CONTENT_TYPES,
  DEFAULT_PREFERENCES,
  ISSUE_TYPES_CHANGED_EVENT,
  LINK_TYPES_CHANGED_EVENT,
  PRIORITIES_CHANGED_EVENT,
  assertAvatarFile,
  formatAvatarLimit,
  notifyAvatarChanged,
} from "./shared";

export { CHANGE_HISTORY_MAX_LIMIT } from "./shared";
