"use client";

import { useState, useCallback } from "react";
import ScanPage from "@/components/ScanPage";
import Dashboard from "@/components/Dashboard";
import type { TriageResult } from "@/lib/types";

export default function Home() {
  const [results, setResults] = useState<TriageResult[]>([]);
  const [view, setView] = useState<"scan" | "dashboard">("scan");

  const handleResult = useCallback((result: TriageResult) => {
    setResults((prev) => {
      // Replace if same scan key exists, otherwise prepend
      const idx = prev.findIndex((r) => r.scanKey === result.scanKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = result;
        return next;
      }
      return [result, ...prev];
    });
    setView("dashboard");
  }, []);

  const handleRerun = useCallback(
    (idx: number) => {
      const result = results[idx];
      if (!result) return;
      setView("scan");
    },
    [results]
  );

  if (view === "dashboard" && results.length > 0) {
    return (
      <Dashboard
        results={results}
        onRerun={handleRerun}
      />
    );
  }

  return <ScanPage onResult={handleResult} />;
}
