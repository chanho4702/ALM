/**
 * git 브랜치 이름(Linear "Copy git branch name") — 규칙의 정본은 alm-backend README "이슈 키·브랜치 이름 규칙".
 *
 * - 제목 슬러그: 소문자로 바꾼 뒤 `[a-z0-9]` 밖 글자를 `-`로, 연속 `-`는 하나로, 앞뒤 `-`는 지운다.
 * - **음역하지 않는다** — 한글·기호만 남는 제목이면 슬러그가 비고 브랜치는 키만 쓴다.
 * - 슬러그는 40자까지 — 단어 한가운데서 잘리면 그 앞 `-`에서 자른다(단어 하나가 40자를 넘으면 그대로 자른다).
 * - 형식: `[<접두>/]<키 소문자>-<슬러그>` — 키는 영숫자·`_`·`-`라 git 참조 규칙에 걸리지 않는다.
 */
export const BRANCH_SLUG_MAX = 40;

export function branchSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= BRANCH_SLUG_MAX) return slug;
  const cut = slug.slice(0, BRANCH_SLUG_MAX);
  // 자른 자리 바로 뒤가 구분자면 단어 경계에서 잘린 것 — 그대로 둔다
  if (slug[BRANCH_SLUG_MAX] === "-") return cut.replace(/-+$/, "");
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

export function branchName(issue: { key: string; title: string }, prefix = ""): string {
  const key = issue.key.toLowerCase();
  const slug = branchSlug(issue.title);
  const base = slug ? `${key}-${slug}` : key;
  const head = prefix.trim().replace(/\/+$/, "");
  return head ? `${head}/${base}` : base;
}

/** ⌘/Ctrl+Shift+. — Linear와 같은 키. Shift를 누르면 `key`가 배열마다 달라(`>`) 물리 키(`code`)로 본다 */
export function isCopyBranchKey(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "code" | "key">): boolean {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return false;
  return event.code === "Period" || event.key === "." || event.key === ">";
}
