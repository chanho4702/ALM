/**
 * frappe-gantt(MIT)는 타입 선언을 배포하지 않는다. 우리가 실제로 쓰는 표면만 좁게 선언한다 —
 * any로 열어두면 옵션 오타가 조용히 지나간다.
 */
declare module "frappe-gantt" {
  export interface GanttTask {
    id: string;
    name: string;
    /** "YYYY-MM-DD" */
    start: string;
    end: string;
    /** 0~100 */
    progress: number;
    /** 선행 작업 id를 콤마로 이은 문자열 */
    dependencies?: string;
  }

  export interface GanttOptions {
    view_mode?: "Day" | "Week" | "Month";
    readonly?: boolean;
    popup?: boolean | ((...args: unknown[]) => unknown);
    on_click?: (task: GanttTask) => void;
  }

  export default class Gantt {
    constructor(target: HTMLElement | string, tasks: GanttTask[], options?: GanttOptions);
    change_view_mode(mode: GanttOptions["view_mode"]): void;
    refresh(tasks: GanttTask[]): void;
  }
}
