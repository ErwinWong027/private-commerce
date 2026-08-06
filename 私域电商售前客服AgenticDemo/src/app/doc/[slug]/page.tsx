import { notFound } from "next/navigation";
import { getDocEntries, getDocEntry, getDocHtml } from "@/lib/docRegistry";
import styles from "../doc.module.css";

interface DocDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const entries = await getDocEntries();
  return entries.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: DocDetailPageProps) {
  const { slug } = await params;
  const doc = await getDocEntry(slug);

  if (!doc) {
    return { title: "文档不存在" };
  }

  return {
    title: `${doc.title} | 文档中心`,
    description: doc.description,
  };
}

export default async function DocDetailPage({ params }: DocDetailPageProps) {
  const { slug } = await params;
  const currentDoc = await getDocEntry(slug);

  if (!currentDoc) {
    notFound();
  }

  const htmlContent = await getDocHtml(slug);

  if (htmlContent === null) {
    notFound();
  }

  return (
    <div className={styles.viewerCard}>
      <iframe
        srcDoc={htmlContent}
        style={{ border: "none", width: "100%", height: "100%" }}
        title={currentDoc.title}
      />
    </div>
  );
}
