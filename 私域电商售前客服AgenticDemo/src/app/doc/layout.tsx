import { getDocEntries } from "@/lib/docRegistry";
import DocHeader from "@/components/DocHeader";
import styles from "./doc.module.css";

export default async function DocLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const docEntries = await getDocEntries();
  const docs = docEntries.map(d => ({
    slug: d.slug,
    title: d.title,
    shortTitle: d.shortTitle,
  }));

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DocHeader docs={docs} />
        {children}
      </div>
    </main>
  );
}
