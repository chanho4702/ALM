import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Select, TextField, useToast } from "@chanho/react";
import { ExternalLink, GitCommitHorizontal, GitPullRequest, Globe, Plus } from "lucide-react";
import type { WebLink, WebLinkKind } from "../store/types";
import { addWebLink, listWebLinks, removeWebLink } from "../store/jiraStore";

/** 종류는 아이콘 + 텍스트로 그린다(값 표기 규칙) */
const KIND_META: Record<WebLinkKind, { label: string; icon: typeof Globe }> = {
  PR: { label: "PR", icon: GitPullRequest },
  COMMIT: { label: "커밋", icon: GitCommitHorizontal },
  WEB: { label: "웹", icon: Globe },
};
const KINDS: WebLinkKind[] = ["WEB", "PR", "COMMIT"];

function KindGlyph({ kind }: { kind: WebLinkKind }) {
  const Icon = KIND_META[kind].icon;
  return <Icon size={14} aria-hidden data-testid={`web-link-kind-${kind}`} />;
}

export interface IssueWebLinksProps {
  issueId: string;
  /** 편집 권한 — 없으면 목록만 보이고 추가·삭제는 없다 */
  canEdit: boolean;
}

/**
 * 웹 링크(F-08, 지라 Issue links → Web link) — PR·커밋·문서 주소를 이슈에 붙인다. 새 탭으로 열린다.
 * 같은 URL을 다시 넣으면 서버가 기존 링크를 돌려준다(200) — "이미 연결된 링크"로 알린다.
 */
export function IssueWebLinks({ issueId, canEdit }: IssueWebLinksProps) {
  const toast = useToast();
  const [links, setLinks] = useState<WebLink[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<WebLinkKind>("WEB");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLinks(await listWebLinks(issueId));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [issueId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { link, created } = await addWebLink(issueId, { url, title, kind });
      if (created) {
        toast({ title: "웹 링크를 추가했습니다", appearance: "success" });
      } else {
        toast({ title: "이미 연결된 링크입니다", description: link.title ?? link.url, appearance: "info" });
      }
      setUrl("");
      setTitle("");
      setKind("WEB");
      setFormOpen(false);
      await reload();
    } catch (error) {
      toast({
        title: "웹 링크 추가 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (link: WebLink) => {
    try {
      await removeWebLink(link.id);
      toast({ title: "웹 링크를 제거했습니다", appearance: "success" });
      await reload();
    } catch (error) {
      toast({
        title: "웹 링크 제거 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <section className="issue-relations" data-testid="issue-web-links" aria-label="웹 링크">
      <div className="issue-relations-head">
        <h4>웹 링크</h4>
        {canEdit ? (
          <Button
            variant="ghost"
            size="small"
            aria-expanded={formOpen}
            iconBefore={<Plus size={14} />}
            onClick={() => setFormOpen((open) => !open)}
          >
            웹 링크
          </Button>
        ) : null}
      </div>
      {loadError !== null ? (
        <p className="issue-relations-more" role="alert">
          웹 링크를 불러오지 못했습니다 — {loadError}
        </p>
      ) : null}
      {links.length > 0 ? (
        <ul className="issue-relation-list">
          {links.map((link) => (
            <li key={link.id} className="issue-link-item">
              <a className="issue-relation-row issue-web-link" href={link.url} target="_blank" rel="noreferrer noopener">
                <span className="issue-web-link-kind">
                  <KindGlyph kind={link.kind} />
                  {KIND_META[link.kind].label}
                </span>
                <span className="issue-relation-title">{link.title ?? link.url}</span>
                <ExternalLink size={12} aria-hidden />
              </a>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={`${link.title ?? link.url} 웹 링크 제거`}
                  onClick={() => void handleRemove(link)}
                >
                  ×
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && formOpen ? (
        <form
          className="issue-link-add"
          onSubmit={handleAdd}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setFormOpen(false);
          }}
        >
          <TextField
            label="URL"
            type="url"
            placeholder="https://"
            value={url}
            autoFocus
            onChange={(event) => setUrl(event.target.value)}
          />
          <TextField
            label="표시 이름"
            placeholder="예: 설계 문서 (선택)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Select
            label="링크 종류"
            value={kind}
            options={KINDS.map((k) => ({ value: k, label: KIND_META[k].label, icon: <KindGlyph kind={k} /> }))}
            onValueChange={(value) => setKind(value as WebLinkKind)}
          />
          <Button type="submit" size="small" disabled={busy || !url.trim()}>
            추가
          </Button>
          <Button type="button" variant="ghost" size="small" onClick={() => setFormOpen(false)}>
            취소
          </Button>
        </form>
      ) : null}
    </section>
  );
}
