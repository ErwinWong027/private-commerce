'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "@/app/doc/doc.module.css";

interface DocHeaderProps {
  docs: Array<{
    slug: string;
    title: string;
    shortTitle: string;
  }>;
}

export default function DocHeader({ docs }: DocHeaderProps) {
  const params = useParams();
  const slug = params?.slug as string;
  const currentDoc = docs.find(d => d.slug === slug);

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/doc" className={styles.logo}>
          📚 文档中心
        </Link>
        {currentDoc && (
          <>
            <span className={styles.divider}>/</span>
            <span className={styles.currentDocTitle}>{currentDoc.title}</span>
          </>
        )}
      </div>
      <nav className={styles.navLinks} aria-label="文档切换">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/doc/${doc.slug}`}
            className={`${styles.navLink} ${doc.slug === slug ? styles.navLinkActive : ""}`}
          >
            {doc.shortTitle}
          </Link>
        ))}
        <Link href="/" className={styles.backButton}>
          返回系统首页
        </Link>
      </nav>
    </header>
  );
}
