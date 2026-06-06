"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function EnterpriseDocumentMetrics() {
  const [stats, setStats] = useState<{ awaitingReview: number; archiveCount: number; openRiskCount: number } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/documents/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.stats) {
          setStats({
            awaitingReview: Number(data.stats.awaitingReview || data.stats.needsReviewCount || 0),
            archiveCount: Number(data.stats.archiveCount || 0),
            openRiskCount: Number(data.stats.openRiskCount || 0),
          });
        }
      })
      .catch(() => setStats({ awaitingReview: 0, archiveCount: 0, openRiskCount: 0 }));
  }, []);

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <Link
        href="/document-intelligence"
        className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15"
      >
        Invoice queue: {stats ? stats.awaitingReview : "…"} awaiting review
      </Link>
      <Link
        href="/document-intelligence#archive"
        className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15"
      >
        Archived: {stats ? stats.archiveCount : "…"}
      </Link>
      <Link
        href="/invoice-forensics"
        className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15"
      >
        Open risks: {stats ? stats.openRiskCount : "…"}
      </Link>
    </div>
  );
}
