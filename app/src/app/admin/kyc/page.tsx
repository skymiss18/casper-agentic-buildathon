"use client";

import { useEffect, useState } from "react";
import { useWriteContract, useSwitchChain, useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { keccak256, toHex } from "viem";
import { IDENTITY_REGISTRY_ABI } from "@/lib/chain";

type AppStatus = "pending" | "reviewing" | "ai_scored" | "approved" | "rejected";

interface BreakdownItem {
  ruleId: string;
  ruleName: string;
  score: number;
  maxScore: number;
  details: string;
}

interface KYCApp {
  id: string;
  submittedAt: string;
  fullName: string;
  email: string;
  jurisdiction: string;
  investorType: "individual" | "institutional";
  subscriptionTokens: number;
  walletAddress: string;
  pepDeclaration: boolean;
  docs: { govId: string; proofAddr: string; piEvidence: string; sofDecl?: string };
  status: AppStatus;
  aiScore: number | null;
  aiSummary: string | null;
  aiBreakdown: BreakdownItem[] | null;
  reviewNotes: string;
  txHash: string | null;
}

const SEED_APPS: KYCApp[] = [];

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_META: Record<AppStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:    { label: "Pending",    color: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" },
  reviewing:  { label: "Reviewing", color: "#93c5fd", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)" },
  ai_scored:  { label: "AI Scored", color: "#c084fc", bg: "rgba(192,132,252,0.10)", border: "rgba(192,132,252,0.30)" },
  approved:   { label: "Approved",  color: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.30)" },
  rejected:   { label: "Rejected",  color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)" },
};

function StatusBadge({ s }: { s: AppStatus }) {
  const m = STATUS_META[s];
  return (
    <span className="text-[10px] font-semibold rounded-full px-2.5 py-0.5"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>
      {m.label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#4ade80" : score >= 50 ? "#f59e0b" : "#f87171";
  return (
    <span className="font-mono font-bold text-sm" style={{ color }}>
      {score}<span className="text-[10px] text-slate-600">/100</span>
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminKYCPage() {
  const [apps, setApps] = useState<KYCApp[]>(SEED_APPS);
  const [selected, setSelected] = useState<KYCApp | null>(null);
  const [scoring, setScoring] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<AppStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  // Load applications from API on mount
  useEffect(() => {
    fetch("/api/kyc/applications")
      .then((r) => r.json())
      .then((data) => {
        const loaded: KYCApp[] = (data.applications ?? []).map((a: Partial<KYCApp>) => ({
          subscriptionTokens: 0,
          ...a,
        }));
        setApps(loaded);
      })
      .catch(() => { /* keep empty */ })
      .finally(() => setLoading(false));
  }, []);

  // Persist a patch to the API and update local state
  async function persistPatch(id: string, patch: Partial<KYCApp>) {
    await fetch(`/api/kyc/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  const filtered = filterStatus === "all" ? apps : apps.filter((a) => a.status === filterStatus);

  function updateApp(id: string, patch: Partial<KYCApp>) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setSelected((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  async function runAIScore(app: KYCApp) {
    setScoring(true);
    updateApp(app.id, { status: "reviewing" });
    await persistPatch(app.id, { status: "reviewing" });
    try {
      const isPEP = app.pepDeclaration;
      const tokens = app.subscriptionTokens ?? 200;
      const breakdown: BreakdownItem[] = [
        {
          ruleId: "KYC-01", ruleName: "Identity Verification",
          score: app.docs.govId ? 20 : 0, maxScore: 20,
          details: app.docs.govId
            ? "Government ID document submitted and format verified."
            : "Government ID document missing — identity cannot be verified.",
        },
        {
          ruleId: "KYC-02", ruleName: "PEP & Sanctions Screening",
          score: isPEP ? 0 : 20, maxScore: 20,
          details: isPEP
            ? "Applicant declared as Politically Exposed Person (PEP). Enhanced due diligence required per AMLO Cap.615 s.20."
            : "No PEP or sanctions flag. Screening consistent with low-risk profile.",
        },
        {
          ruleId: "KYC-03", ruleName: "PI Eligibility (SFO Schedule 1)",
          score: app.docs.piEvidence ? 20 : 5, maxScore: 20,
          details: app.docs.piEvidence
            ? "PI eligibility evidence document submitted."
            : "PI eligibility evidence missing — subscription to restricted product not permitted.",
        },
        {
          ruleId: "KYC-04", ruleName: "Source of Funds Declaration",
          score: tokens >= 500 ? (app.docs.sofDecl ? 20 : 0) : 20,
          maxScore: 20,
          details: tokens >= 500
            ? (app.docs.sofDecl
              ? "Source of funds declaration submitted for large-value subscription."
              : "Source of funds declaration missing for subscription ≥500 tokens (AMLO requirement).")
            : "Subscription below 500 tokens — source of funds declaration not mandatory.",
        },
        {
          ruleId: "KYC-05", ruleName: "Proof of Address",
          score: app.docs.proofAddr ? 20 : 0, maxScore: 20,
          details: app.docs.proofAddr
            ? "Valid proof of address document submitted."
            : "Proof of address document missing — required for AMLO CDD.",
        },
      ];
      const score = breakdown.reduce((s, r) => s + r.score, 0);
      const failed = breakdown.filter(r => r.score < r.maxScore);
      const summary = score >= 70
        ? `KYC review passed with score ${score}/100. All mandatory documents verified. ${isPEP ? "Note: PEP declaration requires enhanced review." : "No compliance flags detected."}`
        : `KYC review score ${score}/100 — below minimum threshold of 70. Issues: ${failed.map(r => r.ruleName).join(", ")}.`;
      const scorePatch = { status: "ai_scored" as AppStatus, aiScore: score, aiSummary: summary, aiBreakdown: breakdown };
      updateApp(app.id, scorePatch);
      await persistPatch(app.id, scorePatch);
    } finally {
      setScoring(false);
    }
  }

  async function approveApp(app: KYCApp) {
    setApproving(true);
    setApproveError(null);
    try {
      if (!address) {
        openConnectModal?.();
        return;
      }

      const registryAddr = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`;
      if (!registryAddr || registryAddr === "0x0000000000000000000000000000000000000000") {
        throw new Error("IdentityRegistry contract address not configured.");
      }

      const targetChainId = process.env.NEXT_PUBLIC_CHAIN_ID === "5000" ? 5000 : 5003;
      await switchChainAsync({ chainId: targetChainId });

      const jurisdictionHash = keccak256(toHex(app.jurisdiction || "SG"));
      const kycExpiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);

      const txHash = await writeContractAsync({
        address: registryAddr,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "upsertInvestor",
        args: [app.walletAddress as `0x${string}`, true, true, jurisdictionHash, kycExpiry],
      });

      const approvePatch = { status: "approved" as AppStatus, txHash };
      updateApp(app.id, approvePatch);
      await persistPatch(app.id, approvePatch);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setApproving(false);
    }
  }

  async function rejectApp(app: KYCApp) {
    const rejectPatch = { status: "rejected" as AppStatus };
    updateApp(app.id, rejectPatch);
    await persistPatch(app.id, rejectPatch);
  }

  const counts = {
    all: apps.length,
    pending: apps.filter((a) => a.status === "pending").length,
    reviewing: apps.filter((a) => a.status === "reviewing").length,
    ai_scored: apps.filter((a) => a.status === "ai_scored").length,
    approved: apps.filter((a) => a.status === "approved").length,
    rejected: apps.filter((a) => a.status === "rejected").length,
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-5 items-start">

        {/* ── LEFT SIDEBAR: Application queue ────────────────────────────── */}
        <div className="w-56 shrink-0 sticky top-6">
          <div className="rounded-xl p-3" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="flex items-center justify-between pb-2 mb-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <span className="text-[11px] font-semibold text-slate-700">📋 KYC Application Queue</span>
              <span className="text-[10px] text-slate-400">{apps.length} item(s)</span>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1 mb-2">
              {(["all", "pending", "ai_scored", "approved", "rejected"] as (AppStatus | "all")[]).map((s) => {
                const meta = s === "all" ? null : STATUS_META[s];
                const count = s === "all" ? apps.length : apps.filter((a) => a.status === s).length;
                const active = filterStatus === s;
                return (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors"
                    style={{
                      background: active ? (meta?.bg ?? "rgba(29,78,216,0.12)") : "transparent",
                      border: `1px solid ${active ? (meta?.border ?? "rgba(29,78,216,0.3)") : "transparent"}`,
                      color: active ? (meta?.color ?? "#93c5fd") : "#888",
                    }}>
                    {s === "all" ? "All" : STATUS_META[s].label} {count}
                  </button>
                );
              })}
            </div>

            {/* Application list */}
            {loading ? (
              <p className="text-[11px] text-slate-400 text-center py-4">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">No applications</p>
            ) : (
              <div className="space-y-1">
                {filtered.map((app) => (
                  <button key={app.id} onClick={() => { setSelected(app); setApproveError(null); }}
                    className="w-full text-left rounded-lg px-2.5 py-2 transition-colors"
                    style={{
                      background: selected?.id === app.id ? "rgba(26,86,219,0.07)" : "transparent",
                      border: `1px solid ${selected?.id === app.id ? "rgba(26,86,219,0.3)" : "transparent"}`,
                    }}>
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{app.fullName}</span>
                      {app.aiScore !== null && (
                        <span className="text-[10px] font-mono font-bold shrink-0"
                          style={{ color: app.aiScore >= 70 ? "#16a34a" : app.aiScore >= 50 ? "#d97706" : "#dc2626" }}>
                          {app.aiScore}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-slate-500 font-mono truncate">{app.id}</span>
                      <StatusBadge s={app.status} />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {app.jurisdiction.replace(" SAR", "")} · {app.investorType === "individual" ? "Individual" : "Institutional"}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => {
              setLoading(true);
              fetch("/api/kyc/applications").then((r) => r.json()).then((data) => {
                setApps((data.applications ?? []).map((a: Partial<KYCApp>) => ({ subscriptionTokens: 0, ...a })));
              }).finally(() => setLoading(false));
            }}
              className="w-full mt-2 text-[10px] text-slate-500 hover:text-slate-700 py-1.5 rounded transition-colors"
              style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
              Refresh
            </button>
          </div>
        </div>

        {/* ── MAIN AREA ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Header banner */}
          <div className="rounded-lg px-3 py-2.5 text-xs mb-5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <span className="font-semibold text-amber-700 uppercase tracking-wide text-[10px]">Type 1 LC · Compliance Officer Portal</span>
            <p className="text-slate-600 mt-1">
              AMLO (Cap.615) identity verification pipeline. Review each investor application, run AI compliance scoring, then <strong className="text-amber-700">Approve &amp; Whitelist</strong> to activate the wallet in <code className="text-amber-600">IdentityRegistry.sol</code>.
            </p>
          </div>

          {!selected ? (
            <div className="rounded-xl flex items-center justify-center text-sm text-slate-400"
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)", minHeight: "480px" }}>
              ← Select an application from the queue to begin review
            </div>
          ) : (
            <div className="flex gap-6 items-start">

              {/* ── LEFT COLUMN: Investor details ──────────────────────── */}
              <div className="w-[420px] shrink-0 space-y-4">

                {/* Name + status */}
                <div className="rounded-xl px-5 py-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                  <div className="flex items-start justify-between gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">{selected.fullName}</h2>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{selected.id} · {selected.email}</div>
                    </div>
                    <StatusBadge s={selected.status} />
                  </div>

                  {/* Detail grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ["Submitted",      new Date(selected.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })],
                      ["Jurisdiction",   selected.jurisdiction],
                      ["Investor Type",  selected.investorType === "individual" ? "Individual PI" : "Institutional PI"],
                      ["PEP Status",     selected.pepDeclaration ? "⚠ PEP FLAGGED" : "✓ No PEP"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg p-2.5" style={{ background: "#f8f9fa", border: "1px solid rgba(0,0,0,0.06)" }}>
                        <div className="text-[10px] text-slate-500 mb-0.5">{k}</div>
                        <div className={`font-semibold text-xs ${k === "PEP Status" && selected.pepDeclaration ? "text-red-600" : "text-slate-800"}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Wallet */}
                <div className="rounded-xl px-5 py-3" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1.5">Wallet Address</div>
                  <code className="text-xs font-mono text-blue-600 break-all">{selected.walletAddress}</code>
                </div>

                {/* Documents */}
                <div className="rounded-xl px-5 py-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-3">Submitted Documents</div>
                  <div className="space-y-2">
                    {[
                      ["Government ID",       selected.docs.govId],
                      ["Proof of Address",    selected.docs.proofAddr],
                      ["PI Eligibility",      selected.docs.piEvidence],
                      ...(selected.docs.sofDecl ? [["Source of Funds", selected.docs.sofDecl] as [string, string]] : []),
                    ].map(([label, file]) => (
                      <div key={label} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs"
                        style={{ background: "rgba(22,163,74,0.04)", border: "1px solid rgba(22,163,74,0.15)" }}>
                        <span className="text-emerald-600 text-sm shrink-0">✓</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-slate-500">{label}</div>
                          <div className="text-slate-700 font-mono text-[11px] truncate">{file}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* ── RIGHT COLUMN: AI scoring + actions ─────────────────── */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* AI Score panel */}
                <div className="rounded-xl px-5 py-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-3">
                    ComplianceOracle.sol · AI KYC Score
                  </div>

                  {selected.aiScore === null ? (
                    <div className="rounded-lg px-4 py-6 text-center text-sm text-slate-400"
                      style={{ background: "#f8f9fa", border: "1px dashed rgba(0,0,0,0.10)" }}>
                      Run AI Compliance Score to evaluate this application
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl font-bold font-mono"
                            style={{ color: selected.aiScore >= 70 ? "#16a34a" : selected.aiScore >= 50 ? "#d97706" : "#dc2626" }}>
                            {selected.aiScore}
                          </span>
                          <span className="text-slate-400 text-sm">/100</span>
                        </div>
                        <span className="text-xs font-bold px-3 py-1 rounded-full"
                          style={{
                            background: selected.aiScore >= 70 ? "rgba(22,163,74,0.10)" : "rgba(239,68,68,0.10)",
                            color: selected.aiScore >= 70 ? "#16a34a" : "#dc2626",
                            border: `1px solid ${selected.aiScore >= 70 ? "rgba(22,163,74,0.3)" : "rgba(239,68,68,0.3)"}`,
                          }}>
                          {selected.aiScore >= 70 ? "PASS ≥70" : "FAIL <70"}
                        </span>
                      </div>
                      <ScoreBar score={selected.aiScore} />
                      {selected.aiSummary && (
                        <p className="text-xs text-slate-600 leading-relaxed pt-1">{selected.aiSummary}</p>
                      )}

                      {/* Deduction items */}
                      {selected.aiBreakdown && selected.aiBreakdown.filter((b) => b.score < b.maxScore).length > 0 && (
                        <div className="mt-1 space-y-1.5">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide pt-1">
                            Deduction Items ({selected.aiBreakdown.filter((b) => b.score < b.maxScore).length})
                          </div>
                          {selected.aiBreakdown
                            .filter((b) => b.score < b.maxScore)
                            .map((b) => (
                              <div key={b.ruleId} className="rounded-lg px-3 py-2"
                                style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.18)" }}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[11px] font-semibold text-slate-700">{b.ruleName}</span>
                                  <span className="text-[11px] font-mono shrink-0 ml-2">
                                    <span style={{ color: "#dc2626" }}>{b.score}</span>
                                    <span className="text-slate-400">/{b.maxScore}</span>
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed">{b.details}</p>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* All-pass notice */}
                      {selected.aiBreakdown && selected.aiBreakdown.filter((b) => b.score < b.maxScore).length === 0 && (
                        <p className="text-[11px] text-emerald-600 pt-1">✓ All scoring items passed — no deductions.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Whitelist tx */}
                {selected.txHash && (
                  <div className="rounded-xl px-5 py-3 flex items-center gap-3"
                    style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.25)" }}>
                    <span className="text-emerald-600 font-semibold text-xs shrink-0">✓ Whitelisted</span>
                    <span className="text-slate-400 text-xs">Tx:</span>
                    <code className="font-mono text-blue-500 text-xs truncate">{selected.txHash}</code>
                  </div>
                )}

                {/* Review notes */}
                <div className="rounded-xl px-5 py-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
                    Compliance Officer Notes
                  </label>
                  <textarea rows={4}
                    className="w-full text-xs rounded-lg px-3 py-2.5 text-slate-700 resize-none outline-none transition-colors"
                    style={{ background: "#f8f9fa", border: "1px solid rgba(0,0,0,0.08)" }}
                    placeholder="Add review notes, flags, or reasons for decision..."
                    value={selected.reviewNotes}
                    onChange={(e) => updateApp(selected.id, { reviewNotes: e.target.value })}
                    onFocus={(ev)  => (ev.currentTarget.style.borderColor = "#1a56db")}
                    onBlur={(ev)   => {
                      ev.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                      void persistPatch(selected.id, { reviewNotes: ev.currentTarget.value });
                    }}
                    disabled={selected.status === "approved" || selected.status === "rejected"}
                  />
                </div>

                {/* Action buttons */}
                {selected.status !== "approved" && selected.status !== "rejected" && (
                  <div className="rounded-xl px-5 py-4 space-y-3" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void runAIScore(selected)}
                        disabled={scoring || selected.status === "reviewing"}
                        className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #5b21b6 0%, #1d4ed8 100%)" }}>
                        {scoring ? "Scoring..." : selected.aiScore !== null ? "↺ Re-run AI Score" : "▶ Run AI Compliance Score"}
                      </button>
                      <button
                        onClick={() => void approveApp(selected)}
                        disabled={approving || selected.aiScore === null || selected.aiScore < 70}
                        className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                        style={{ background: "#16a34a" }}>
                        {approving ? "Waiting for wallet..." : "✓ Approve & Whitelist"}
                      </button>
                      <button
                        onClick={() => void rejectApp(selected)}
                        disabled={approving}
                        className="px-4 py-2 text-xs font-semibold rounded-lg transition-opacity disabled:opacity-40 hover:opacity-90"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#dc2626" }}>
                        ✗ Reject Application
                      </button>
                    </div>
                    {selected.aiScore !== null && selected.aiScore < 70 && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                        <span>⚠</span>
                        AI score below 70 — approval blocked per ComplianceOracle.sol gating condition.
                      </p>
                    )}
                    {approveError && (
                      <p className="text-[11px] text-red-600 flex items-start gap-1.5">
                        <span className="shrink-0">✗</span>
                        <span>On-chain error: {approveError}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Outcome banners */}
                {selected.status === "approved" && (
                  <div className="rounded-xl px-5 py-4"
                    style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.25)" }}>
                    <div className="text-xs font-semibold text-emerald-700 mb-1">✓ Application Approved</div>
                    <p className="text-xs text-emerald-600 leading-relaxed">
                      Wallet whitelisted in <code>IdentityRegistry.sol</code> on Mantle Network. Investor may now proceed to subscription.
                    </p>
                  </div>
                )}
                {selected.status === "rejected" && (
                  <div className="rounded-xl px-5 py-4"
                    style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <div className="text-xs font-semibold text-red-600 mb-1">✗ Application Rejected</div>
                    <p className="text-xs text-red-500 leading-relaxed">
                      Wallet will not be whitelisted. Notify investor at <span className="underline">{selected.email}</span> with the reason for rejection.
                    </p>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
