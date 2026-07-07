import { useEffect, useMemo, useState } from "react";
import { usePdfStore, type PdfDoc } from "@/editors/pdf/pdfStore";
import { dispatch } from "@/commands/history";
import { downloadFile } from "@/files/download";
import { readComments, type CommentItem } from "@/editors/pdf/annotComments";

interface Thread {
  parent: CommentItem;
  replies: CommentItem[];
  resolved: boolean;
}

function buildThreads(items: CommentItem[]): Thread[] {
  const byParent = new Map<number, CommentItem[]>();
  for (const it of items) {
    if (it.irt !== null) {
      const list = byParent.get(it.irt);
      if (list) list.push(it);
      else byParent.set(it.irt, [it]);
    }
  }
  return items
    .filter((it) => it.irt === null)
    .map((parent) => {
      const children = byParent.get(parent.obj) ?? [];
      const states = children.filter((c) => c.state);
      const resolved = states.length > 0 && states[states.length - 1].state === "Completed";
      return { parent, replies: children.filter((c) => c.contents && !c.state), resolved };
    });
}

function summarise(threads: Thread[]): string {
  return threads
    .map((t) => {
      const head = `[${t.parent.subtype}] p.${t.parent.page}${t.parent.author ? ` — ${t.parent.author}` : ""}${t.resolved ? " (resolved)" : ""}`;
      const body = t.parent.contents ? `\n  ${t.parent.contents}` : "";
      const replies = t.replies.map((r) => `\n  ↳ ${r.author}: ${r.contents}`).join("");
      return head + body + replies;
    })
    .join("\n\n");
}

export function PdfComments({ doc }: { doc: PdfDoc }): JSX.Element {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [author, setAuthor] = useState("");
  const [type, setType] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const jumpTo = usePdfStore((s) => s.jumpTo);

  useEffect(() => {
    let alive = true;
    setItems(null);
    void readComments(doc.bytes).then((c) => alive && setItems(c));
    return () => {
      alive = false;
    };
  }, [doc.bytes]);

  const threads = useMemo(() => (items ? buildThreads(items) : []), [items]);
  const authors = useMemo(
    () => [...new Set(threads.map((t) => t.parent.author).filter(Boolean))],
    [threads],
  );
  const types = useMemo(() => [...new Set(threads.map((t) => t.parent.subtype))], [threads]);

  const shown = threads.filter(
    (t) => (!author || t.parent.author === author) && (!type || t.parent.subtype === type),
  );

  const reply = (t: Thread): void => {
    if (!replyText.trim()) return;
    void dispatch("pdf.addReply", {
      pageIndex: t.parent.page - 1,
      parent: { obj: t.parent.obj, gen: t.parent.gen },
      contents: replyText.trim(),
    });
    setReplyText("");
    setReplyTo(null);
  };

  const toggleResolved = (t: Thread): void => {
    void dispatch("pdf.setCommentState", {
      pageIndex: t.parent.page - 1,
      parent: { obj: t.parent.obj, gen: t.parent.gen },
      state: t.resolved ? "None" : "Completed",
    });
  };

  if (items === null) return <div className="pdf-panel-empty">Reading comments…</div>;
  if (threads.length === 0) return <div className="pdf-panel-empty">No comments yet.</div>;

  return (
    <div className="pdf-comments">
      <div className="pdf-comments-filters">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="input" value={author} onChange={(e) => setAuthor(e.target.value)}>
          <option value="">All authors</option>
          {authors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          className="btn btn-ghost"
          title="Export summary"
          onClick={() =>
            downloadFile(
              `${doc.name.replace(/\.pdf$/i, "")}-comments.txt`,
              new TextEncoder().encode(summarise(shown)),
            )
          }
        >
          Export
        </button>
      </div>
      <ul className="pdf-comments-list">
        {shown.map((t) => (
          <li key={`${t.parent.obj}-${t.parent.gen}`} className="pdf-comment">
            <div className="pdf-comment-head">
              <button className="pdf-comment-page" onClick={() => jumpTo(t.parent.page)}>
                p.{t.parent.page}
              </button>
              <span className="pdf-comment-type">{t.parent.subtype}</span>
              {t.parent.author && <span className="pdf-comment-author">{t.parent.author}</span>}
              {t.resolved && <span className="badge badge-ok">resolved</span>}
            </div>
            {t.parent.contents && <div className="pdf-comment-body">{t.parent.contents}</div>}
            {t.replies.map((r) => (
              <div key={`${r.obj}-${r.gen}`} className="pdf-comment-reply">
                <span className="pdf-comment-author">{r.author}</span> {r.contents}
              </div>
            ))}
            <div className="pdf-comment-actions">
              <button className="btn btn-ghost" onClick={() => setReplyTo(replyTo === t.parent.obj ? null : t.parent.obj)}>
                Reply
              </button>
              <button className="btn btn-ghost" onClick={() => toggleResolved(t)}>
                {t.resolved ? "Reopen" : "Resolve"}
              </button>
            </div>
            {replyTo === t.parent.obj && (
              <div className="pdf-comment-replybox">
                <textarea
                  className="input"
                  rows={2}
                  autoFocus
                  placeholder="Reply…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button className="btn btn-primary" onClick={() => reply(t)}>
                  Send
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
