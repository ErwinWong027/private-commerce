import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export interface DocEntry {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  category: string;
  sourcePath: string;
  sourceType: "html" | "md";
}

const projectRoot = process.cwd();
const curatedDocOrder = [
  {
    slug: "overview",
    title: "总览",
    shortTitle: "总览",
    description: "查看私域售前 Demo 的整体目标、能力边界与演示路径。",
    category: "文档中心",
  },
  {
    slug: "acceptance-matrix",
    title: "验收矩阵",
    shortTitle: "验收矩阵",
    description: "查看核心场景、验收标准与当前覆盖情况。",
    category: "文档中心",
  },
  {
    slug: "deployment",
    title: "部署说明",
    shortTitle: "部署说明",
    description: "查看本地运行、环境变量和部署操作说明。",
    category: "文档中心",
  },
  {
    slug: "ontology",
    title: "业务本体与状态流",
    shortTitle: "业务本体",
    description: "查看核心业务对象、行动边界和状态迁移设计。",
    category: "文档中心",
  },
  {
    slug: "AgentTestCaseSuite",
    title: "测试套件说明",
    shortTitle: "测试套件",
    description: "查看测试集结构、覆盖范围与验证方法。",
    category: "文档中心",
  },
  {
    slug: "presales-demo-report",
    title: "自动化测试报告",
    shortTitle: "测试报告",
    description: "查看 Demo 自动化回归结果与失败明细。",
    category: "文档中心",
  },
] as const;

// Helper to escape HTML characters
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Inline markdown renderer for headers/paragraphs
function renderInlineMarkdown(line: string): string {
  let output = escapeHtml(line);
  output = output.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return output;
}

// Parse YAML frontmatter
function parseFrontmatter(content: string): {
  data: Record<string, string>;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const data: Record<string, string> = {};
  let body = content;

  if (frontmatterMatch) {
    body = content.slice(frontmatterMatch[0].length).trim();
    const yamlLines = frontmatterMatch[1].split("\n");
    let currentKey = "";
    let inMultiLine = false;
    let multiLineVal: string[] = [];

    for (const line of yamlLines) {
      if (inMultiLine) {
        if (line.startsWith(" ") || line.trim() === "") {
          multiLineVal.push(line.trim());
          continue;
        } else {
          data[currentKey] = multiLineVal.join(" ");
          inMultiLine = false;
          multiLineVal = [];
        }
      }

      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim();
        if (val === "|" || val === ">") {
          currentKey = key;
          inMultiLine = true;
        } else {
          // Strip surrounding quotes
          data[key] = val.replace(/^["']|["']$/g, "");
        }
      }
    }
    if (inMultiLine && currentKey) {
      data[currentKey] = multiLineVal.join(" ");
    }
  }

  return { data, body };
}

// Markdown parser implementation
function markdownToHtml(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const chunks: string[] = [];
  let index = 0;
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeLines: string[] = [];

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        chunks.push(
          `<pre><code class="language-${escapeHtml(codeLanguage || "text")}">${escapeHtml(
            codeLines.join("\n")
          )}</code></pre>`
        );
        inCodeBlock = false;
        codeLanguage = "";
        codeLines = [];
      } else {
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
      }
      index += 1;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      index += 1;
      continue;
    }

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      chunks.push("<hr />");
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const blockquoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        blockquoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      const calloutType =
        blockquoteLines[0]?.match(/^\[!([A-Z]+)\]$/)?.[1].toLowerCase() ?? "note";
      const contentLines =
        blockquoteLines[0]?.startsWith("[!") ? blockquoteLines.slice(1) : blockquoteLines;

      const contentHtml = contentLines
        .filter(Boolean)
        .map((item) => `<p>${renderInlineMarkdown(item)}</p>`)
        .join("");

      chunks.push(`<blockquote class="callout ${calloutType}">${contentHtml}</blockquote>`);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      chunks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const match = itemLine.match(/^\d+\.\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      chunks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const match = itemLine.match(/^-\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      chunks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length) {
        const tableLine = lines[index].trim();
        if (!tableLine.startsWith("|") || !tableLine.endsWith("|")) {
          break;
        }
        tableLines.push(tableLine);
        index += 1;
      }

      if (tableLines.length > 0) {
        const rows = tableLines.map((row) => {
          return row
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());
        });

        let hasHeader = false;
        if (rows.length > 1 && rows[1].every((cell) => /^[:\-\s]+$/.test(cell))) {
          hasHeader = true;
        }

        const tableBody: string[] = [];
        tableBody.push("<table>");

        if (hasHeader) {
          tableBody.push("<thead><tr>");
          rows[0].forEach((cell) => {
            tableBody.push(`<th>${renderInlineMarkdown(cell)}</th>`);
          });
          tableBody.push("</tr></thead><tbody>");
          rows.slice(2).forEach((row) => {
            tableBody.push("<tr>");
            row.forEach((cell) => {
              tableBody.push(`<td>${renderInlineMarkdown(cell)}</td>`);
            });
            tableBody.push("</tr>");
          });
          tableBody.push("</tbody>");
        } else {
          tableBody.push("<tbody>");
          rows.forEach((row) => {
            tableBody.push("<tr>");
            row.forEach((cell) => {
              tableBody.push(`<td>${renderInlineMarkdown(cell)}</td>`);
            });
            tableBody.push("</tr>");
          });
          tableBody.push("</tbody>");
        }
        tableBody.push("</table>");
        chunks.push(tableBody.join("\n"));
        continue;
      }
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const current = lines[index].trim();
      if (
        current.startsWith("#") ||
        current.startsWith(">") ||
        current.startsWith("- ") ||
        /^\d+\.\s+/.test(current) ||
        current === "---" ||
        current.startsWith("```") ||
        (current.startsWith("|") && current.endsWith("|"))
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      chunks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
      continue;
    }

    index += 1;
  }

  return chunks.join("\n");
}

function wrapHtmlDocument(
  title: string,
  summary: string,
  bodyHtml: string,
  category: string = "文档中心"
): string {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      :root {
        --bg: #eef3fb;
        --panel: rgba(255, 255, 255, 0.92);
        --panel-strong: #ffffff;
        --line: rgba(96, 120, 156, 0.16);
        --text: #12203a;
        --muted: #5f6f8b;
        --blue: #214fda;
        --blue-soft: rgba(33, 79, 218, 0.08);
        --shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
        --radius-xl: 28px;
        --radius-lg: 20px;
        --radius-md: 14px;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        color: var(--text);
        background: #ffffff;
      }
      a { color: var(--blue); text-decoration: none; }
      .page-shell { width: 100%; max-width: 100%; margin: 0; padding: 24px; }
      .hero { display: none !important; }
      h1, h2, h3 { letter-spacing: -0.02em; }
      h1 { margin: 0 0 20px; font-size: 32px; }
      h2 { margin: 28px 0 14px; font-size: 24px; }
      h3 { margin: 24px 0 12px; font-size: 19px; }
      p, li { font-size: 15px; line-height: 1.9; color: #25324a; }
      p { margin: 0 0 14px; }
      ul, ol { margin: 0 0 16px; padding-left: 22px; }
      li + li { margin-top: 8px; }
      hr { margin: 28px 0; border: none; border-top: 1px solid rgba(96, 120, 156, 0.18); }
      code { padding: 2px 8px; border-radius: 8px; background: var(--blue-soft); color: #173eb8; font-size: 0.95em; }
      pre { margin: 16px 0 18px; padding: 18px 20px; overflow: auto; border-radius: var(--radius-lg); background: #0f172a; color: #dbeafe; font-size: 13px; line-height: 1.7; }
      pre code { padding: 0; background: transparent; color: inherit; }
      .callout { margin: 18px 0 20px; padding: 16px 18px; border-radius: var(--radius-lg); border: 1px solid rgba(59, 130, 246, 0.2); background: #f8fbff; }
      .callout.important { border-color: rgba(245, 158, 11, 0.3); background: #fff9ec; }
      .callout p:last-child { margin-bottom: 0; }
      table { width: 100%; border-collapse: collapse; margin: 18px 0 20px; font-size: 14px; line-height: 1.6; }
      th, td { padding: 10px 14px; border: 1px solid rgba(96, 120, 156, 0.18); text-align: left; }
      th { background-color: var(--blue-soft); color: var(--blue); font-weight: 600; }
      tr:nth-child(even) { background-color: #fcfdfe; }
    </style>
  </head>
  <body>
    <div class="page-shell">
      <article class="article">
        ${bodyHtml}
      </article>
    </div>
  </body>
</html>`;
}

// Global cached entries list to avoid reading FS on every request
let cachedEntries: DocEntry[] | null = null;

// Dynamically scan documentation directories
export async function getDocEntries(): Promise<DocEntry[]> {
  if (cachedEntries) {
    return cachedEntries;
  }

  const scannedEntries: DocEntry[] = [];
  const searchDirs = [
    { dir: path.join(projectRoot, "docs"), defaultCategory: "设计文档" },
    { dir: path.join(projectRoot, "skills"), defaultCategory: "验证Skill" },
    { dir: path.join(projectRoot, "tests"), defaultCategory: "测试评估" },
    { dir: path.join(projectRoot, "tests", "reports"), defaultCategory: "测试评估" },
  ];

  for (const { dir, defaultCategory } of searchDirs) {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const fileStat = await stat(fullPath);

        if (fileStat.isFile() && (file.endsWith(".md") || file.endsWith(".html"))) {
          const ext = file.endsWith(".md") ? "md" : "html";
          const rawContent = await readFile(fullPath, "utf8");
          const { data } = parseFrontmatter(rawContent);

          const slug = path.basename(file, `.${ext}`);
          const title = data.title || slug;
          const description = data.description || `查看系统文档: ${title}`;
          const category = data.doc_type || data.category || defaultCategory;

          scannedEntries.push({
            slug,
            title,
            shortTitle: title.slice(0, 8),
            description,
            category,
            sourcePath: fullPath,
            sourceType: ext,
          });
        }
      }
    } catch {
      // Directory might not exist yet, skip
    }
  }

  const entryMap = new Map(scannedEntries.map((entry) => [entry.slug, entry]));
  const entries: DocEntry[] = [];

  for (const item of curatedDocOrder) {
    const matched = entryMap.get(item.slug);
    if (!matched) {
      continue;
    }

    entries.push({
      ...matched,
      title: item.title,
      shortTitle: item.shortTitle,
      description: item.description,
      category: item.category,
    });
  }

  cachedEntries = entries;
  return entries;
}

export async function getDocEntry(slug: string): Promise<DocEntry | undefined> {
  const entries = await getDocEntries();
  return entries.find((entry) => entry.slug === slug);
}

export async function getDocHtml(slug: string): Promise<string | null> {
  const entry = await getDocEntry(slug);
  if (!entry) return null;

  let content = await readFile(entry.sourcePath, "utf8");

  if (entry.sourceType === "html") {
    // Inject mermaid rendering if needed
    if (content.includes('class="mermaid"') || content.includes("class='mermaid'")) {
      const mermaidScript = `
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  (function() {
    function initMermaid() {
      if (window.mermaid) {
        const nodes = Array.from(document.querySelectorAll('pre.mermaid'));
        nodes.forEach(n => { n.textContent = n.textContent.trim(); });
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
          flowchart: { useMaxWidth: false, htmlLabels: true }
        });
        window.mermaid.run({ nodes });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMermaid);
    } else {
      initMermaid();
    }
  })();
</script>
`;
      content = content.includes("</body>")
        ? content.replace("</body>", `${mermaidScript}</body>`)
        : content + mermaidScript;
    }
    return content;
  }

  const { data, body } = parseFrontmatter(content);
  const htmlBody = markdownToHtml(body);
  return wrapHtmlDocument(entry.title, data.description || entry.description, htmlBody, entry.category);
}

export interface DocHtmlParts {
  styles: string;
  body: string;
  hasMermaid: boolean;
}

function stripConflictingStyles(css: string): string {
  let result = css;
  result = result.replace(/^\*\s*\{[\s\S]*?\}/gm, "");
  result = result.replace(/\b(html|body)\s*\{[\s\S]*?\}/g, "");
  return result;
}

export async function getDocHtmlParts(slug: string): Promise<DocHtmlParts | null> {
  const entry = await getDocEntry(slug);
  if (!entry) return null;

  const rawContent = await readFile(entry.sourcePath, "utf8");
  let fullHtml: string;

  if (entry.sourceType === "html") {
    fullHtml = rawContent;
  } else {
    const { data, body } = parseFrontmatter(rawContent);
    const htmlBody = markdownToHtml(body);
    fullHtml = wrapHtmlDocument(entry.title, data.description || entry.description, htmlBody, entry.category);
  }

  const styleMatches = [...fullHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  const rawStyles = styleMatches.map((m) => m[1]).join("\n");
  const styles = stripConflictingStyles(rawStyles);

  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : fullHtml;
  body = body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  const hasMermaid = fullHtml.includes('class="mermaid"') || fullHtml.includes("class='mermaid'");

  return { styles, body, hasMermaid };
}

// Helper to clear registry cache (e.g. after adding documents)
export function invalidateDocCache(): void {
  cachedEntries = null;
}
