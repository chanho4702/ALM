# alm-front

지라(Jira)를 모방한 **자체 ALM 제품**의 프론트엔드. 지라 클론이 아니라 지라의 검증된 구조 위에
ALM 특색(한국어 스마트 검색, 필터 URL 공유, 저장 필터 사이드바, 단순 시간추적)을 얹는다.
현재는 프론트 단독 — localStorage 목업이 백엔드를 대신한다.

## 불변 규칙

1. **화면은 `src/features/alm/store/jiraStore.ts`의 async 함수만 호출한다.**
   localStorage 접근·데이터 가공을 화면에 두지 않는다. 백엔드(jira-service) 교체 지점은 이 파일 하나.
2. **UI는 100% `@chanho/react` 디자인 시스템.** 다른 UI 라이브러리 금지. 커스텀 마크업은
   디자인 토큰(`--chanho-*`)만 사용. 함정 목록: `docs/areas/design-system.md` (특히
   Checkbox/Switch는 `onCheckedChange`, Select는 빈 문자열 value 금지 → 센티널).
3. **UX가 애매하면 무조건 지라를 참고**하되, ALM 특색이 지라보다 우선.
4. 백엔드 없이는 못 만드는 기능은 구현하지 말고 `docs/BACKLOG.md`에 기록만.
5. **node 프로세스 일괄 kill 금지** — 사용자의 dev 서버(포트 5175)가 함께 죽는다.
   죽일 땐 netstat으로 특정 PID만.

## 검증·커밋

- `pnpm typecheck && pnpm test && pnpm build` 전부 통과 후 커밋.
- 커밋 메시지: `feat(scope): 한국어 설명`. 테스트 개수가 변하면 `docs/STATUS.md`와
  README의 카운트도 갱신.
- dev 서버: `pnpm dev --port 5175 --strictPort` (사용자가 직접 띄움).

## 문서 지도

- **부위별 가이드(먼저 읽기)**: `docs/areas/README.md` — 스토어/설정·워크플로/검색/화면/DS/테스트.
  알려진 미해결 이슈 목록도 여기 있다.
- 현황 스냅샷: `docs/STATUS.md` · 백엔드 의존 백로그: `docs/BACKLOG.md`
- 설계 이력: `docs/superpowers/specs/` · 태스크 계획 이력: `docs/superpowers/plans/`

## 작업 사이클

스펙 → 플랜 → 구현. 큰 작업은 사용자 승인("ㄱㄱ") 후 진행. 진행 현황의 진실은 `docs/STATUS.md`.
