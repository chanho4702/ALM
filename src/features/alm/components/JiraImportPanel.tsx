import { useMemo, useState } from "react";
import { Button, Card, Lozenge, Select, useToast } from "@chanho/react";
import type { CsvContext, CsvMappings, CsvRowError } from "../store/csv";
import { analyzeCsv, csvToIssueInputs, parseCsv } from "../store/csv";
import type { ImportResult } from "../store/jiraStore";
import { importIssues } from "../store/jiraStore";
import { KIND_LABELS } from "./labels";

const UNASSIGNED = "__unassigned__";
const SKIP = "__skip__";

export interface JiraImportPanelProps {
  projectId: string;
  ctx: CsvContext;
  onImported: () => void;
}

/**
 * 지라 이관 마법사 — 지라 CSV 내보내기를 읽고, 우리가 모르는 상태·타입·담당자를 **먼저 짝지은 뒤**
 * 가져온다. 키(Issue key)는 보존된다. 짝짓지 않은 값이 남으면 그 행은 건너뛰고 사유를 남긴다.
 * 첨부·코멘트 이관은 별도 도구(후속)다.
 */
export function JiraImportPanel({ projectId, ctx, onImported }: JiraImportPanelProps) {
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const analysis = useMemo(() => (rows.length > 0 ? analyzeCsv(rows, ctx) : null), [rows, ctx]);

  const mappings: CsvMappings = useMemo(
    () => ({
      statuses: statusMap,
      types: typeMap,
      assignees: Object.fromEntries(
        Object.entries(assigneeMap).map(([name, value]) => [name, value === UNASSIGNED ? null : value]),
      ),
    }),
    [statusMap, typeMap, assigneeMap],
  );
  const parsed = useMemo(
    () => (rows.length > 0 ? csvToIssueInputs(rows, ctx, mappings) : { inputs: [], errors: [] as CsvRowError[] }),
    [rows, ctx, mappings],
  );

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRows(parseCsv(String(reader.result ?? "")));
      setStatusMap({});
      setTypeMap({});
      setAssigneeMap({});
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const imported = await importIssues(projectId, parsed.inputs);
      setResult(imported);
      toast({
        title: `${imported.created}개 이슈를 가져왔습니다`,
        appearance: imported.failed.length > 0 ? "info" : "success",
      });
      onImported();
    } catch (error) {
      toast({
        title: "가져오기 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const statusOptions = [
    { value: SKIP, label: "건너뛰기" },
    ...ctx.statuses.map((s) => ({ value: s.id, label: `${s.name} (${KIND_LABELS[s.kind ?? "new"]})` })),
  ];
  const typeOptions = [{ value: SKIP, label: "건너뛰기" }, ...ctx.types.map((t) => ({ value: t.id, label: t.name }))];
  const assigneeOptions = [
    { value: UNASSIGNED, label: "미지정으로" },
    ...ctx.users.map((u) => ({ value: u.id, label: u.name })),
  ];

  const unmapped =
    (analysis?.unknown.statuses.filter((v) => !statusMap[v]).length ?? 0) +
    (analysis?.unknown.types.filter((v) => !typeMap[v]).length ?? 0) +
    (analysis?.unknown.assignees.filter((v) => !assigneeMap[v]).length ?? 0);

  return (
    <div className="project-settings">
      <Card padding="lg" title="지라에서 가져오기">
        <p className="admin-scheme-note">
          지라의 <strong>이슈 → 내보내기 → CSV(모든 필드)</strong> 파일을 그대로 읽습니다. Issue key는 보존되고,
          우리가 모르는 상태·타입·담당자는 아래에서 짝지은 뒤 가져옵니다. 첨부·코멘트는 아직 이관하지
          않습니다.
        </p>
        <label className="issue-attachments-upload">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="지라 CSV 파일"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <span className="issue-attachments-upload-text">CSV 파일 고르기</span>
        </label>
        {fileName && analysis ? (
          <p className="csv-import-summary">
            <strong>{fileName}</strong> — {analysis.rowCount}행, 읽을 수 있는 행 {parsed.inputs.length}개
            {parsed.errors.length > 0 ? `, 건너뛸 행 ${parsed.errors.length}개` : ""}
          </p>
        ) : null}
      </Card>

      {analysis && (analysis.unknown.statuses.length > 0 || analysis.unknown.types.length > 0 || analysis.unknown.assignees.length > 0) ? (
        <Card padding="lg" title="값 짝짓기">
          <p className="admin-scheme-note">
            파일에는 있지만 이 프로젝트에 없는 값입니다. 어디로 보낼지 고르세요. 고르지 않으면 그 행은 건너뜁니다.
          </p>
          {analysis.unknown.statuses.length > 0 ? (
            <section aria-label="상태 짝짓기" className="import-map-group">
              <h4 className="reports-group">상태</h4>
              {analysis.unknown.statuses.map((value) => (
                <div key={value} className="import-map-row">
                  <Lozenge appearance="neutral">{value}</Lozenge>
                  <span aria-hidden>→</span>
                  <Select
                    label={`상태 ${value}`}
                    value={statusMap[value] ?? SKIP}
                    options={statusOptions}
                    onValueChange={(v) =>
                      setStatusMap((prev) => {
                        const next = { ...prev };
                        if (v === SKIP) delete next[value];
                        else next[value] = v;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </section>
          ) : null}
          {analysis.unknown.types.length > 0 ? (
            <section aria-label="타입 짝짓기" className="import-map-group">
              <h4 className="reports-group">타입</h4>
              {analysis.unknown.types.map((value) => (
                <div key={value} className="import-map-row">
                  <Lozenge appearance="neutral">{value}</Lozenge>
                  <span aria-hidden>→</span>
                  <Select
                    label={`타입 ${value}`}
                    value={typeMap[value] ?? SKIP}
                    options={typeOptions}
                    onValueChange={(v) =>
                      setTypeMap((prev) => {
                        const next = { ...prev };
                        if (v === SKIP) delete next[value];
                        else next[value] = v;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </section>
          ) : null}
          {analysis.unknown.assignees.length > 0 ? (
            <section aria-label="담당자 짝짓기" className="import-map-group">
              <h4 className="reports-group">담당자</h4>
              {analysis.unknown.assignees.map((value) => (
                <div key={value} className="import-map-row">
                  <Lozenge appearance="neutral">{value}</Lozenge>
                  <span aria-hidden>→</span>
                  <Select
                    label={`담당자 ${value}`}
                    value={assigneeMap[value] ?? SKIP}
                    options={[{ value: SKIP, label: "건너뛰기" }, ...assigneeOptions]}
                    onValueChange={(v) =>
                      setAssigneeMap((prev) => {
                        const next = { ...prev };
                        if (v === SKIP) delete next[value];
                        else next[value] = v;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </section>
          ) : null}
        </Card>
      ) : null}

      {analysis ? (
        <Card padding="lg" title="가져오기">
          {parsed.errors.length > 0 ? (
            <ul className="csv-import-errors" aria-label="건너뛰는 행">
              {parsed.errors.slice(0, 8).map((error) => (
                <li key={error.row}>
                  {error.row}행: {error.reason}
                </li>
              ))}
              {parsed.errors.length > 8 ? <li>… 외 {parsed.errors.length - 8}개</li> : null}
            </ul>
          ) : null}
          {unmapped > 0 ? (
            <p className="reports-warning">{`짝짓지 않은 값 ${unmapped}개 — 해당 행은 건너뜁니다.`}</p>
          ) : null}
          <div className="project-form-actions">
            <Button disabled={parsed.inputs.length === 0 || busy} onClick={() => void handleImport()}>
              {`${parsed.inputs.length}개 이슈 가져오기`}
            </Button>
          </div>
          {result ? (
            <div className="dash-progress-flags" aria-label="가져오기 결과">
              <Lozenge appearance="success">{`만듦 ${result.created}건`}</Lozenge>
              <Lozenge appearance={result.failed.length > 0 ? "warning" : "neutral"}>{`실패 ${result.failed.length}건`}</Lozenge>
            </div>
          ) : null}
          {result && result.failed.length > 0 ? (
            <ul className="csv-import-errors" aria-label="실패한 행">
              {result.failed.map((f) => (
                <li key={`${f.row}-${f.title}`}>
                  {f.row}행 {f.title}: {f.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
