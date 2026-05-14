// Typeset structured-document preview for kind="doc" output blocks — ADRs,
// memos, specs, policies, offer letters, board financials. Sans-serif (these
// are internal working documents, not blog prose). Renders headings, ordered
// and unordered lists, tables, and inline <cite> tags. Never a raw <pre>.
//
// Markdown is parsed by a small block-level parser below; inline emphasis
// (**bold**, `code`) is rendered as plain text, matching BlogDraftCard — the
// structural typesetting is the value-add, not a full markdown engine.

import { CitedText, type CitationContext } from "./CitedText";

type DocSection = { heading: string; body_markdown: string };

type Props = {
  title: string;
  doc_type: string;
  body_markdown: string;
  sections?: DocSection[];
  ctx?: CitationContext;
};

type MdBlock =
  | { t: "heading"; level: number; text: string }
  | { t: "para"; text: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "table"; header: string[] | null; rows: string[][] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^\d+[.)]\s+(.*)$/;
const TABLE_SEP_RE = /^\|?[\s:|-]+\|?$/;

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ t: "para", text: para.join("\n") });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      flushPara();
      continue;
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
      flushPara();
      blocks.push({ t: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    // Table: a run of consecutive pipe-prefixed lines. A `|---|---|` second
    // row promotes the first to a header; otherwise every row is a body row.
    if (trimmed.startsWith("|")) {
      flushPara();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      i -= 1;
      let header: string[] | null = null;
      let bodyStart = 0;
      if (tableLines.length >= 2 && TABLE_SEP_RE.test(tableLines[1])) {
        header = splitRow(tableLines[0]);
        bodyStart = 2;
      }
      blocks.push({ t: "table", header, rows: tableLines.slice(bodyStart).map(splitRow) });
      continue;
    }

    // List: a run of same-type (ordered or unordered) item lines.
    const ulm = trimmed.match(UL_RE);
    const olm = trimmed.match(OL_RE);
    if (ulm || olm) {
      flushPara();
      const ordered = !!olm;
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(ordered ? OL_RE : UL_RE);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      i -= 1;
      blocks.push({ t: "list", ordered, items });
      continue;
    }

    para.push(trimmed);
  }
  flushPara();
  return blocks;
}

function MarkdownBody({ src, ctx }: { src: string; ctx?: CitationContext }) {
  const blocks = parseMarkdown(src);
  return (
    <div className="space-y-3.5">
      {blocks.map((b, i) => {
        if (b.t === "heading") {
          const sizeClass =
            b.level <= 1
              ? "text-[20px] font-semibold mt-5"
              : b.level === 2
                ? "text-[16.5px] font-semibold mt-4"
                : "text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mt-3";
          return (
            <h3
              key={i}
              className={`${sizeClass} leading-snug tracking-tight text-foreground text-balance`}
            >
              <CitedText text={b.text} ctx={ctx} preserveBreaks={false} />
            </h3>
          );
        }
        if (b.t === "list") {
          const items = b.items.map((it, j) => (
            <li key={j} className="text-pretty">
              <CitedText text={it} ctx={ctx} preserveBreaks={false} />
            </li>
          ));
          const listClass =
            "pl-5 space-y-1.5 text-[14.5px] leading-[1.6] text-foreground/90 " +
            (b.ordered ? "list-decimal" : "list-disc");
          return b.ordered ? (
            <ol key={i} className={listClass}>
              {items}
            </ol>
          ) : (
            <ul key={i} className={listClass}>
              {items}
            </ul>
          );
        }
        if (b.t === "table") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">
                {b.header ? (
                  <thead>
                    <tr>
                      {b.header.map((h, j) => (
                        <th
                          key={j}
                          className="border-b-2 px-3 py-1.5 text-left font-semibold text-foreground"
                        >
                          <CitedText text={h} ctx={ctx} preserveBreaks={false} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td
                          key={k}
                          className="border-b px-3 py-1.5 align-top text-foreground/90 tabular-nums"
                        >
                          <CitedText text={cell} ctx={ctx} preserveBreaks={false} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i} className="text-[14.5px] leading-[1.65] text-foreground/90 text-pretty">
            <CitedText text={b.text} ctx={ctx} preserveBreaks />
          </p>
        );
      })}
    </div>
  );
}

export function DocCard({ title, doc_type, body_markdown, sections, ctx }: Props) {
  return (
    <article className="w-full max-w-[720px] rounded-2xl border bg-card text-card-foreground p-6 sm:p-8 shadow-sm">
      <header className="mb-5">
        <span className="inline-flex items-center rounded-full border bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {doc_type}
        </span>
        <h1 className="mt-2.5 text-[24px] sm:text-[27px] font-bold leading-[1.15] tracking-tight text-foreground text-balance">
          <CitedText text={title} ctx={ctx} preserveBreaks={false} />
        </h1>
      </header>

      <MarkdownBody src={body_markdown} ctx={ctx} />

      {sections && sections.length > 0 ? (
        <div className="mt-6 space-y-6">
          {sections.map((s, i) => (
            <section key={i} className="border-t pt-5">
              <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground/80 text-balance">
                <CitedText text={s.heading} ctx={ctx} preserveBreaks={false} />
              </h2>
              <MarkdownBody src={s.body_markdown} ctx={ctx} />
            </section>
          ))}
        </div>
      ) : null}
    </article>
  );
}
