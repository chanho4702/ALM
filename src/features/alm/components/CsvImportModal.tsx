import { useState } from "react";
import { Button, Modal, useToast } from "@chanho/react";
import type { CsvContext, CsvIssueInput, CsvRowError } from "../store/csv";
import { csvToIssueInputs, parseCsv } from "../store/csv";
import { importIssues } from "../store/jiraStore";

export interface CsvImportModalProps {
  open: boolean;
  projectId: string;
  ctx: CsvContext;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * CSV 가져오기 — 우리 내보내기 형식과 지라 내보내기(영문 헤더)를 같이 읽는다. 파일을 고르면
 * 먼저 몇 줄을 읽을 수 있고 어떤 줄이 왜 빠지는지 보여주고, 가져오기는 읽힌 줄만 만든다.
 * 키(Issue key) 열이 있으면 그 키를 보존한다(이관).
 */
export function CsvImportModal({ open, projectId, ctx, onOpenChange, onDone }: CsvImportModalProps) {
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [inputs, setInputs] = useState<CsvIssueInput[]>([]);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFileName("");
    setInputs([]);
    setErrors([]);
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = csvToIssueInputs(parseCsv(String(reader.result ?? "")), ctx);
      setInputs(parsed.inputs);
      setErrors(parsed.errors);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const result = await importIssues(projectId, inputs);
      toast({
        title: `${result.created}개 이슈를 가져왔습니다`,
        appearance: result.failed.length > 0 ? "info" : "success",
      });
      if (result.failed.length > 0) {
        toast({
          title: `${result.failed.length}개는 만들지 못했습니다`,
          description: result.failed.map((f) => `${f.title}: ${f.reason}`).join(" · "),
          appearance: "danger",
        });
      }
      reset();
      onOpenChange(false);
      onDone();
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

  return (
    <Modal
      trigger={<span hidden />}
      title="CSV 가져오기"
      description="우리 내보내기 형식이나 지라 CSV 내보내기(Summary, Issue Type, Status …)를 읽습니다. 키 열이 있으면 키를 보존합니다."
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <div className="csv-import">
        <label className="issue-attachments-upload">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV 파일"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <span className="issue-attachments-upload-text">파일 고르기</span>
        </label>
        {fileName ? (
          <p className="csv-import-summary">
            <strong>{fileName}</strong> — 읽을 수 있는 행 {inputs.length}개
            {errors.length > 0 ? `, 건너뛸 행 ${errors.length}개` : ""}
          </p>
        ) : null}
        {inputs.length > 0 ? (
          <ul className="csv-import-preview" aria-label="가져올 이슈 미리보기">
            {inputs.slice(0, 5).map((input, index) => (
              <li key={index}>
                {input.key ? <span className="issue-key-cell">{input.key}</span> : null} {input.title}
              </li>
            ))}
            {inputs.length > 5 ? <li className="dash-empty">… 외 {inputs.length - 5}개</li> : null}
          </ul>
        ) : null}
        {errors.length > 0 ? (
          <ul className="csv-import-errors" aria-label="건너뛰는 행">
            {errors.slice(0, 8).map((error) => (
              <li key={error.row}>
                {error.row}행: {error.reason}
              </li>
            ))}
            {errors.length > 8 ? <li>… 외 {errors.length - 8}개</li> : null}
          </ul>
        ) : null}
        <div className="create-issue-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            disabled={inputs.length === 0 || busy}
            onClick={() => void handleImport()}
          >
            가져오기
          </Button>
        </div>
      </div>
    </Modal>
  );
}
