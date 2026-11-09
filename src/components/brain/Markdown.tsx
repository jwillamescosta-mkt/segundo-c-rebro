import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createNote, type Note } from "@/lib/brain";
import { normalizeTitle } from "@/lib/markdown-utils";
import { useBrain } from "./app-context";

function preprocess(md: string) {
  return md
    .split(/(```[\s\S]*?```)/g)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg
        .replace(/\[\[([^[\]|#\n]+)(?:#[^[\]|\n]*)?(?:\|([^[\]\n]+))?\]\]/g, (_m, t: string, alias?: string) => {
          return `[${(alias ?? t).trim()}](wikilink:${encodeURIComponent(t.trim())})`;
        })
        .replace(/(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu, (m, pre: string, tag: string) =>
          /^\d+$/.test(tag) ? m : `${pre}[#${tag}](tag:${encodeURIComponent(tag)})`,
        );
    })
    .join("");
}

export function useOpenWikilink() {
  const { notes } = useBrain();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async (title: string) => {
    const found = notes.find((n) => normalizeTitle(n.title) === normalizeTitle(title));
    if (found) return navigate({ to: "/nota/$id", params: { id: found.id } });
    try {
      const n = await createNote({ title: title.trim(), content: `# ${title.trim()}\n\n`, type: "ideia", status: "pronta" });
      qc.setQueryData<Note[]>(["notes"], (old) => [n, ...(old ?? [])]);
      toast.success(`Nota “${title}” criada`);
      navigate({ to: "/nota/$id", params: { id: n.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a nota.");
    }
  };
}

export function Markdown({ content, onTag }: { content: string; onTag?: (t: string) => void }) {
  const open = useOpenWikilink();
  const { notes } = useBrain();
  const titles = new Set(notes.map((n) => normalizeTitle(n.title)));
  return (
    <div className="prose-brain">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(u) => u}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("wikilink:")) {
              const t = decodeURIComponent(href.slice(9));
              const exists = titles.has(normalizeTitle(t));
              return (
                <span
                  role="link"
                  tabIndex={0}
                  className={exists ? "wikilink" : "wikilink-missing"}
                  title={exists ? `Abrir ${t}` : `Criar nota “${t}”`}
                  onClick={() => open(t)}
                  onKeyDown={(e) => e.key === "Enter" && open(t)}
                >
                  {children}
                </span>
              );
            }
            if (href?.startsWith("tag:")) {
              const t = decodeURIComponent(href.slice(4));
              return (
                <span className="tag-pill cursor-pointer" onClick={() => onTag?.(t)}>
                  {children}
                </span>
              );
            }
            const safe = href && /^(https?:|mailto:|#)/i.test(href) ? href : undefined;
            return (
              <a href={safe} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          img: ({ src, alt }) =>
            typeof src === "string" && /^https?:/i.test(src) ? <img src={src} alt={alt ?? ""} loading="lazy" /> : null,
        }}
      >
        {preprocess(content)}
      </ReactMarkdown>
    </div>
  );
}

/** Read-only markdown with no app context (public share page). */
export function PlainMarkdown({ content }: { content: string }) {
  const md = content.replace(/\[\[([^[\]|#\n]+)(?:#[^[\]|\n]*)?(?:\|([^[\]\n]+))?\]\]/g, (_m, t: string, a?: string) => `**${(a ?? t).trim()}**`);
  return (
    <div className="prose-brain">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href && /^(https?:|mailto:)/i.test(href) ? href : undefined} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}
