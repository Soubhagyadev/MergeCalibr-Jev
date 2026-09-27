"use client";

import { useState, useCallback, useEffect } from "react";
import ScanPage from "@/components/ScanPage";
import Dashboard from "@/components/Dashboard";
import type { TriageResult, PullRequestListItem } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

type View =
  | { kind: "scan" }
  | { kind: "browse"; pullRequests: PullRequestListItem[]; repoUrl: string }
  | { kind: "dashboard" };

export default function Home() {
  const [results, setResults] = useState<TriageResult[]>([]);
  const [view, setView] = useState<View>({ kind: "scan" });

  // Load persisted results from Supabase on first mount
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    sb.from("triage_results")
      .select("result")
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) { console.warn("[supabase] load failed:", error.message); return; }
        if (data && data.length > 0) {
          const loaded = data.map((row) => (row as { result: TriageResult }).result);
          setResults(loaded);
          setView({ kind: "dashboard" });
        }
      });
  }, []);

  // Called when the user enters a repo URL — go straight to dashboard browse mode
  const handleBrowse = useCallback(
    (pullRequests: PullRequestListItem[], repoUrl: string) => {
      setView({ kind: "browse", pullRequests, repoUrl });
    },
    []
  );

  // Called when a triage result arrives (browse PR click or direct PR URL)
  const handleResult = useCallback((result: TriageResult) => {
    setResults((prev) => {
      const idx = prev.findIndex((r) => r.scanKey === result.scanKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = result;
        return next;
      }
      return [result, ...prev];
    });
    setView((current) =>
      current.kind === "browse" ? current : { kind: "dashboard" }
    );
  }, []);

  const handleRerun = useCallback((_idx: number) => {
    setView({ kind: "scan" });
  }, []);

  const handleNewScan = useCallback(() => {
    setView({ kind: "scan" });
  }, []);

  if (view.kind === "dashboard" && results.length > 0) {
    return (
      <Dashboard
        results={results}
        onRerun={handleRerun}
        onNewScan={handleNewScan}
      />
    );
  }

  if (view.kind === "browse") {
    return (
      <Dashboard
        results={results}
        pullRequests={view.pullRequests}
        repoUrl={view.repoUrl}
        onRerun={handleRerun}
        onNewScan={handleNewScan}
        onResult={handleResult}
      />
    );
  }

  return <ScanPage onResult={handleResult} onBrowse={handleBrowse} />;
}
