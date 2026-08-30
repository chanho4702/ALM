import type { Editor } from "@tiptap/core";

/**
 * 테스트 시임 — jsdom에서 contenteditable 타이핑 시뮬레이션이 불안정하므로,
 * 통합 테스트는 라벨로 에디터 인스턴스를 찾아 commands로 입력한다.
 * 프로덕션 코드는 이 모듈에 쓰기만 하고 읽지 않는다(wiki-front editorTestRegistry와 같은 원칙).
 */
export const editorRegistry = new Map<string, Editor>();
