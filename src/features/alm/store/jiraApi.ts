// alm-backend Project/Issue/Sprint REST 계약 어댑터.
// 서버가 아직 저장하지 않는 ALM 확장 필드는 조용히 유실시키지 않고 명시적으로 거부한다.
//
// 도메인별 구현은 ./api/*.ts — 이 파일은 공개 표면(배럴)만 유지한다. jiraStore 파사드와 테스트가 이 경로로 import한다.
export {
  STORE_MODE,
} from "./api/http";
export {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
} from "./api/projects";
export {
  findIssues,
  aggregateIssues,
  listProjectLabels,
  listIssuesPage,
  listIssues,
  getIssueByKey,
  queryIssuesPage,
  createIssue,
  updateIssue,
  cloneIssue,
} from "./api/issues";
export type {
  IssueFilter,
  IssuePage,
  IssueCreateInput,
} from "./api/issues";
export {
  listSprints,
  createSprint,
  updateSprint,
  startSprint,
  completeSprint,
  deleteSprint,
} from "./api/sprints";
export {
  listVersions,
  createVersion,
  updateVersion,
  releaseVersion,
  archiveVersion,
  deleteVersion,
} from "./api/versions";
export {
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  inlineAttachment,
  deleteAttachment,
} from "./api/attachments";
export {
  listProjectChangeWindow,
  listProjectChanges,
} from "./api/history";
export {
  moveIssue,
  rankIssue,
  deleteIssue,
  bulkDeleteTarget,
  BULK_UPDATE_MAX_ITEMS,
  BULK_HIDDEN_ISSUE_LABEL,
  bulkUpdateIssues,
  bulkDeleteIssues,
  importIssues,
} from "./api/issueOps";
export type {
  BulkIssuePatch,
  BulkIssueTarget,
  BulkDeleteTarget,
  BulkResult,
  ImportResult,
} from "./api/issueOps";
export {
  listWatchers,
  watchIssue,
  unwatchIssue,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./api/notifications";
export type {
  WatchersView,
} from "./api/notifications";
export {
  listAuditLog,
  systemStats,
  fetchAgentPersonas,
  fetchOffice,
  fetchPersonaActivity,
} from "./api/admin";
export {
  fetchAgentRuns,
  fetchAgentRun,
  streamOffice,
  cancelRun,
  resumeRun,
  fetchAgentGates,
  approveGate,
  rejectGate,
  createMeeting,
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
  fetchRunDirectives,
  sendRunDirective,
  createAgentRun,
  sendPersonaChat,
  fetchPersonaDialog,
  savePersonaDialog,
} from "./api/office";
export {
  listSchemes,
  countSchemeProjects,
  createScheme,
  updateScheme,
  deleteScheme,
  setDefaultScheme,
  resolveSettings,
  listProjectStatuses,
  __clearStatusMetaCache,
  statusMetaByProject,
  listAllStatuses,
  assignScheme,
  setProjectCustom,
  updateProjectCustomSettings,
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
} from "./api/settings";
export type {
  ResolvedSettings,
  StatusMetaByProject,
} from "./api/settings";
export {
  listDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  listProjectWorklogs,
} from "./api/dashboards";
export {
  listComponents,
  createComponent,
  updateComponent,
  deleteComponent,
} from "./api/components";
export {
  archiveIssue,
  restoreIssue,
  listArchivedIssues,
  archiveProject,
  unarchiveProject,
  listTrashedProjects,
  restoreProject,
  purgeProject,
} from "./api/archive";
export {
  listLinkTypes,
  linkTypeUsage,
  createLinkType,
  updateLinkType,
  moveLinkType,
  deleteLinkType,
  listPriorities,
  priorityUsage,
  createPriority,
  updatePriority,
  movePriority,
  deletePriority,
} from "./api/registries";
export {
  getCurrentUser,
  AVATAR_MAX_BYTES,
  __resetForTest,
  getMyOrgProfile,
  uploadMyAvatar,
  removeMyAvatar,
} from "./api/users";
export {
  listComments,
  addComment,
  updateComment,
  deleteComment,
  listWorklogs,
  addWorklog,
  deleteWorklog,
  listIssueLinks,
  addIssueLink,
  listWebLinks,
  addWebLink,
  removeWebLink,
  removeIssueLink,
  listActivity,
  setIssueParent,
  listIssueAncestors,
  listChildrenPage,
  listChildren,
  searchIssues,
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  listBoardIssues,
} from "./api/collab";
export {
  listUsers,
  listProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  hasAnyProjectAdmin,
  getMyProjectRole,
} from "./api/members";
export {
  listProjectShortcuts,
  addProjectShortcut,
  updateProjectShortcut,
  removeProjectShortcut,
} from "./api/personal";
export {
  listSavedFilters,
  listSharedFilters,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  getMyPreferences,
  saveMyPreferences,
  getBanner,
  saveBanner,
} from "./api/savedFilters";
export {
  queryIssuesAql,
  validateAql,
  aqlFields,
} from "./api/aql";

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
