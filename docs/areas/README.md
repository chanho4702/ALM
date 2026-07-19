# 부위별 개발 문서 (docs/areas)

개발 지속성을 위한 영역별 가이드. 새 세션/새 사람이 특정 부위를 만질 때 **그 문서 하나만 읽으면
규칙·함정·확장 지점을 알 수 있게** 유지한다. 현황 스냅샷은 `../STATUS.md`, 백엔드 의존 항목은
`../BACKLOG.md`, 설계 이력은 `../superpowers/specs/`.

| 문서 | 범위 | 대표 파일 |
|---|---|---|
| [store.md](store.md) | 도메인 스토어(백엔드 교체 지점), 데이터 모델, 마이그레이션 | `src/features/alm/store/jiraStore.ts` |
| [settings-workflow.md](settings-workflow.md) | 설정 스킴, 커스텀 워크플로 상태 모델 | `jiraStore.ts` 설정 구획, `StatusEditor.tsx` |
| [search.md](search.md) | 스마트 검색 문법, 기본/스마트 2모드 검색 화면 | `searchQuery.ts`, `SearchPage.tsx` |
| [screens.md](screens.md) | 라우트 지도, 화면별 역할, 지라 모방 포인트 | `src/app/App.tsx`, `pages/*` |
| [design-system.md](design-system.md) | @chanho/react 사용 규칙과 함정 목록 | 전 컴포넌트, `app.css` |
| [testing.md](testing.md) | 테스트 관례, 안정화 설정, 취약 지점 | `*.test.tsx`, `vitest.config.ts` |

## 전역 불변 규칙 (모든 부위 공통)

1. **화면은 `store/jiraStore.ts`의 async 함수만 호출한다.** localStorage 접근·데이터 가공 로직을
   화면에 두지 않는다. 백엔드(jira-service)가 생기면 이 파일 내부만 fetch로 바뀐다.
2. **UI는 100% `@chanho/react`.** 커스텀 마크업이 필요하면 디자인 토큰(`--chanho-*`)만 사용.
3. **UX가 애매하면 무조건 지라(Jira)를 참고한다.** 단, ALM 특색(한국어 스마트 검색, 필터 URL 공유,
   저장 필터 사이드바, 단순 시간추적 등)은 지라보다 우선한다.
4. 백엔드 없이는 못 만드는 기능은 구현하지 말고 `../BACKLOG.md`에 기록만 한다.
5. 커밋: `feat(scope): 한국어 설명`, 검증은 `pnpm typecheck && pnpm test && pnpm build`.

## 알려진 미해결 이슈 (2026-07-19 전체 리뷰 기준)

우선순위 순. 고치면 이 목록과 해당 부위 문서에서 지운다.
(리뷰 당일 해결됨: 보드 컬럼 orphan 이관, status 쓰기 검증, issueCounters normalize 가드,
백로그 행 키보드 접근, 죽은 토큰 변수)

1. **스마트 검색 공백/센티널 한계** — 공백 포함 라벨·담당 이름, "완료" 등 카테고리 라벨과
   같은 이름의 커스텀 상태 (search.md 참고)
2. **N+1 패턴** — 홈/디렉터리가 프로젝트마다 `listIssues` 호출, 카운트 전용 API 부재
3. **시간 표기 4종 혼재** — 상대시간 헬퍼(`relTime`)가 HomePage 로컬에만 있음
4. (소소) BoardColumn의 도달 불가 폴백·`.issue-card-epic` 죽은 클래스·`#fff` 하드코딩·
   인라인 빈상태 문구 제각각 — 정리 수준
