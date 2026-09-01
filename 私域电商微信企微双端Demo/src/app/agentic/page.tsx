import { getDocEntries, getDocHtmlParts } from "@/server/docRegistry";
import AgenticWorkspace from "@/components/agentic/AgenticWorkspace";

export default async function AgenticPage() {
  const entries = await getDocEntries();
  const docOrder = ["overview", "acceptance-matrix", "deployment", "ontology", "AgentTestCaseSuite"];
  const docs = await Promise.all(
    docOrder.map(async (slug) => {
      const entry = entries.find((item) => item.slug === slug);
      const htmlParts = entry ? await getDocHtmlParts(entry.slug) : null;
      return {
        slug,
        title: entry?.title ?? slug,
        description: entry?.description ?? "",
        docStyles: htmlParts?.styles ?? "",
        body: htmlParts?.body ?? "<div>文档读取失败</div>",
        hasMermaid: htmlParts?.hasMermaid ?? false,
      };
    }),
  );

  return <AgenticWorkspace docs={docs} />;
}
