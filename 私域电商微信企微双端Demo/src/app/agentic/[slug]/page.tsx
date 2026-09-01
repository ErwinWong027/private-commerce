import { notFound } from "next/navigation";
import { getDocEntries, getDocHtmlParts } from "@/server/docRegistry";
import AgenticWorkspace from "@/components/agentic/AgenticWorkspace";

const DOC_ORDER = ["overview", "acceptance-matrix", "deployment", "ontology", "AgentTestCaseSuite"];

export default async function AgenticDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!DOC_ORDER.includes(slug)) {
    notFound();
  }

  const entries = await getDocEntries();
  const docs = await Promise.all(
    DOC_ORDER.map(async (docSlug) => {
      const entry = entries.find((item) => item.slug === docSlug);
      const htmlParts = entry ? await getDocHtmlParts(entry.slug) : null;
      return {
        slug: docSlug,
        title: entry?.title ?? docSlug,
        description: entry?.description ?? "",
        docStyles: htmlParts?.styles ?? "",
        body: htmlParts?.body ?? "<div>文档读取失败</div>",
        hasMermaid: htmlParts?.hasMermaid ?? false,
      };
    }),
  );

  return <AgenticWorkspace docs={docs} />;
}
