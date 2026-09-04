/**
 * 데이터 계층 파사드 — 화면은 이 모듈만 import한다(불변 규칙 1).
 *
 * - 목업(`jiraMock.ts`, localStorage): 테스트·목업 개발의 기본.
 * - REST(`jiraApi.ts`, alm-backend): 프로덕션 빌드 또는 `VITE_ALM_DATA=rest`.
 *   REST 어댑터에 아직 없는 함수(코멘트·보드·링크·워크로그·멤버·사용자·활동)는 목업으로 떨어진다 —
 *   그 기능들의 서버화가 남은 백엔드 과제다(docs/areas/store.md "REST 미구현").
 *
 * 시그니처는 목업이 정본이다(`typeof mock`). REST는 같은 이름·같은 계약으로 미러한다.
 */
import * as mock from "./jiraMock";
import * as rest from "./jiraApi";

export type { ProjectPatch,
  ProjectMemberView,
  VersionInput,
  SprintPlanPatch,
  IssueLinkView,
  ImportResult,
  IssuePage,
  WatchersView,
  BulkIssuePatch,
  BulkResult,
  ResolvedSettings,
} from "./jiraMock";

/** 테스트(vitest)는 항상 목업. 프로덕션 빌드는 REST, 개발은 `VITE_ALM_DATA=rest`로 백엔드에 붙인다 */
export const USE_REST =
  import.meta.env.MODE !== "test" &&
  (import.meta.env.PROD || import.meta.env.VITE_ALM_DATA === "rest");

// REST에 없는 함수는 목업이 채운다 — 계약 타입은 목업 것을 쓴다
const impl = (USE_REST ? { ...mock, ...rest } : mock) as unknown as typeof mock;

export const defaultBoard = impl.defaultBoard;
export const __resetForTest = impl.__resetForTest;
export const listUsers = impl.listUsers;
export const getCurrentUser = impl.getCurrentUser;
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
export const listAttachments = impl.listAttachments;
export const uploadAttachment = impl.uploadAttachment;
export const downloadAttachment = impl.downloadAttachment;
export const deleteAttachment = impl.deleteAttachment;
export const listVersions = impl.listVersions;
export const createVersion = impl.createVersion;
export const updateVersion = impl.updateVersion;
export const releaseVersion = impl.releaseVersion;
export const archiveVersion = impl.archiveVersion;
export const deleteVersion = impl.deleteVersion;
export const versionProgress = impl.versionProgress;
export const listSprints = impl.listSprints;
export const createSprint = impl.createSprint;
export const updateSprint = impl.updateSprint;
export const startSprint = impl.startSprint;
export const completeSprint = impl.completeSprint;
export const listIssues = impl.listIssues;
export const queryIssues = impl.queryIssues;
export const searchIssues = impl.searchIssues;
export const getIssueByKey = impl.getIssueByKey;
export const createIssue = impl.createIssue;
export const updateIssue = impl.updateIssue;
export const moveIssue = impl.moveIssue;
export const listWorklogs = impl.listWorklogs;
export const addWorklog = impl.addWorklog;
export const deleteWorklog = impl.deleteWorklog;
export const setIssueParent = impl.setIssueParent;
export const listChildren = impl.listChildren;
export const addIssueLink = impl.addIssueLink;
export const removeIssueLink = impl.removeIssueLink;
export const listIssueLinks = impl.listIssueLinks;
export const rankIssue = impl.rankIssue;
export const importIssues = impl.importIssues;
export const listAuditLog = impl.listAuditLog;
export const systemStats = impl.systemStats;
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
export const listProjectChanges = impl.listProjectChanges;
export const listActivity = impl.listActivity;
export const DEFAULT_PREFERENCES = mock.DEFAULT_PREFERENCES;
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
export const PRIORITIES_CHANGED_EVENT = mock.PRIORITIES_CHANGED_EVENT;
export const listPriorities = impl.listPriorities;
export const priorityUsage = impl.priorityUsage;
export const createPriority = impl.createPriority;
export const updatePriority = impl.updatePriority;
export const movePriority = impl.movePriority;
export const deletePriority = impl.deletePriority;
export const LINK_TYPES_CHANGED_EVENT = mock.LINK_TYPES_CHANGED_EVENT;
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
