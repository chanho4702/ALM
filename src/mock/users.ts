import type { User } from "../features/jira/store/types";

export const MOCK_USERS: User[] = [
  { id: "u1", name: "김찬호" },
  { id: "u2", name: "이서연" },
  { id: "u3", name: "박준영" },
  { id: "u4", name: "최다인" },
];

/** 목업 고정 현재 유저 */
export const CURRENT_USER_ID = "u1";
