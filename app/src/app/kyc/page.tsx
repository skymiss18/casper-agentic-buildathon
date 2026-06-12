"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet-context";

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;
type InvestorType = "individual" | "institutional";
type KYCStatus = "pending" | "reviewing" | "ai_scored" | "approved" | "rejected";

interface DocFile {
  name: string;
  size: number;
}

interface FormData {
  // Step 1 - Profile
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  jurisdiction: string;
  occupation: string;
  taxResidency: string;
  investorType: InvestorType;
  // Step 3 - Wallet
  walletAddress: string;
  consentAmlo: boolean;
  consentRetention: boolean;
}

interface KYCRecord {
  id: string;
  submittedAt: string;
  fullName: string;
  email: string;
  dateOfBirth: string;
  phone: string;
  occupation: string;
  jurisdiction: string;
  investorType: string;
  walletAddress: string;
  pepDeclaration: boolean;
  docs: { govId: string; proofAddr: string; piEvidence: string; sofDecl?: string };
  status: KYCStatus;
  aiScore: number | null;
  aiSummary: string | null;
  reviewNotes: string;
  txHash: string | null;
}

const STEP_LABELS = ["Investor Profile", "KYC Documents", "Wallet & Consent", "Submission"];

const JURISDICTIONS = [
  { code: "HK", label: "Hong Kong (HK)" },
  { code: "SG", label: "Singapore (SG)" },
  { code: "GB", label: "United Kingdom (GB)" },
  { code: "JP", label: "Japan (JP)" },
  { code: "AU", label: "Australia (AU)" },
];

function formatBytes(n: number) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

// ── File Upload Widget ─────────────────────────────────────────────────────────

function FileUpload({
  label, required, hint, file, onFile, onClear,
}: {
  label: string; required?: boolean; hint?: string;
  file: DocFile | null;
  onFile: (f: DocFile) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFile({ name: f.name, size: f.size });
  }

  return (
    <div>
      <label className="block text-xs text-slate-400 font-medium mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {hint && <p className="text-[11px] text-slate-600 mb-2">{hint}</p>}

      {file ? (
        <div className="flex items-center gap-3 rounded px-3 py-2.5 text-xs"
          style={{ background: "#f3f1eb", border: "1px solid #1d4ed8" }}>
          <span className="text-blue-400 shrink-0">&#128196;</span>
          <div className="flex-1 min-w-0">
            <div className="text-slate-200 truncate font-medium">{file.name}</div>
            <div className="text-slate-600">{file.size === 0 ? "Previously submitted" : formatBytes(file.size)}</div>
          </div>
          <button onClick={onClear}
            className="text-slate-500 hover:text-red-400 transition-colors text-base leading-none shrink-0">
            x
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile({ name: f.name, size: f.size });
          }}
          className="cursor-pointer rounded px-4 py-5 text-center transition-colors hover:bg-gray-100"
          style={{ background: "#ffffff", border: "1px dashed rgba(0,0,0,0.15)" }}
        >
          <div className="text-slate-600 text-lg mb-1">&#8679;</div>
          <div className="text-xs text-slate-500">Drop file here or <span className="text-blue-400">browse</span></div>
          <div className="text-[10px] text-slate-700 mt-1">PDF, JPG, PNG accepted</div>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleChange} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function KYCPage() {
  const { wallet, connect } = useWallet();
  const [step, setStep] = useState<Step>(1);

  const [form, setForm] = useState<FormData>({
    fullName: "", dateOfBirth: "", email: "", phone: "",
    jurisdiction: "HK", occupation: "", taxResidency: "HK", investorType: "individual",
    walletAddress: "", consentAmlo: false, consentRetention: false,
  });

  // Document files
  const [govId,       setGovId]       = useState<DocFile | null>(null);
  const [proofAddr,   setProofAddr]   = useState<DocFile | null>(null);
  const [piEvidence,  setPiEvidence]  = useState<DocFile | null>(null);
  const [sofDecl,     setSofDecl]     = useState<DocFile | null>(null);
  const [pepChecked,  setPepChecked]  = useState(false);

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [appId,      setAppId]        = useState<string | null>(null);

  // My KYC records (all, shown at top of page)
  const [myRecords,      setMyRecords]      = useState<KYCRecord[]>([]);
  const [recordsLoading, setRecordsLoading]  = useState(true);
  const [selectedRecord, setSelectedRecord]  = useState<KYCRecord | null>(null);

  function refreshRecords() {
    setRecordsLoading(true);
    fetch("/api/kyc/applications")
      .then((r) => r.json())
      .then((d) => setMyRecords((d.applications ?? []) as KYCRecord[]))
      .catch(() => {})
      .finally(() => setRecordsLoading(false));
  }

  useEffect(() => { refreshRecords(); }, [appId]); // refresh after new submission

  function handleSelectRecord(rec: KYCRecord) {
    setSelectedRecord(rec);
    // Populate form fields from record
    setForm({
      fullName:        rec.fullName,
      dateOfBirth:     rec.dateOfBirth ?? "",
      email:           rec.email,
      phone:           rec.phone ?? "",
      jurisdiction:    JURISDICTIONS.some(j => j.code === rec.jurisdiction) ? rec.jurisdiction
                         : JURISDICTIONS.find(j => rec.jurisdiction?.includes(j.code))?.code ?? "HK",
      occupation:      rec.occupation ?? "",
      taxResidency:    JURISDICTIONS.some(j => j.code === rec.jurisdiction) ? rec.jurisdiction
                         : JURISDICTIONS.find(j => rec.jurisdiction?.includes(j.code))?.code ?? "HK",
      investorType:    rec.investorType as InvestorType,
      walletAddress:   rec.walletAddress,
      consentAmlo:     false,
      consentRetention: false,
    });
    setGovId(rec.docs?.govId ? { name: rec.docs.govId, size: 0 } : null);
    setProofAddr(rec.docs?.proofAddr ? { name: rec.docs.proofAddr, size: 0 } : null);
    setPiEvidence(rec.docs?.piEvidence ? { name: rec.docs.piEvidence, size: 0 } : null);
    setSofDecl(rec.docs?.sofDecl ? { name: rec.docs.sofDecl, size: 0 } : null);
    setPepChecked(rec.pepDeclaration ?? false);
    // For approved: stay on step 4 view; for rejected: go back to step 1 for re-submission
    if (rec.status === "approved") {
      setStep(4);
      setAppId(rec.id);
    } else {
      setStep(1);
      setAppId(null);
      setSubmitError(null);
    }
  }

  const needsSoF = form.investorType === "institutional";

  function setField<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  useEffect(() => {
    if (wallet) {
      setForm((prev) => (prev.walletAddress === wallet ? prev : { ...prev, walletAddress: wallet }));
      return;
    }
    // Fallback: read already-connected accounts without triggering a popup
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (eth) {
      eth.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) setForm((prev) => (prev.walletAddress === accounts[0] ? prev : { ...prev, walletAddress: accounts[0] }));
      }).catch(() => {});
    }
  }, [wallet]);

  // Step validation
  function step1Valid() {
    return (
      form.fullName.trim() &&
      form.dateOfBirth.trim() &&
      form.email.includes("@") &&
      form.phone.trim() &&
      form.occupation.trim()
    );
  }

  function step2Valid() {
    if (!govId || !proofAddr || !piEvidence) return false;
    if (needsSoF && !sofDecl) return false;
    return true;
  }

  function step3Valid() {
    return /^0x[0-9a-fA-F]{40}$/.test(form.walletAddress) && form.consentAmlo && form.consentRetention;
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/kyc/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:      form.fullName,
          email:         form.email,
          dateOfBirth:   form.dateOfBirth,
          phone:         form.phone,
          occupation:    form.occupation,
          jurisdiction:  form.jurisdiction,
          investorType:  form.investorType,
          walletAddress: form.walletAddress,
          pepDeclaration: pepChecked,
          docs: {
            govId:      govId?.name      ?? "",
            proofAddr:  proofAddr?.name  ?? "",
            piEvidence: piEvidence?.name ?? "",
            ...(sofDecl ? { sofDecl: sofDecl.name } : {}),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setAppId(data.application?.id ?? null);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const STATUS_MAP: Record<KYCStatus, { label: string; color: string; bg: string; border: string }> = {
    pending:   { label: "Pending Review", color: "#d97706", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)" },
    reviewing: { label: "Under Review",  color: "#2563eb", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.25)" },
    ai_scored: { label: "AI Scored",      color: "#7c3aed", bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.25)" },
    approved:  { label: "✓ Approved",     color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.25)" },
    rejected:  { label: "✗ Rejected",     color: "#dc2626", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)" },
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-5 items-start">

        {/* ── Left sidebar: My KYC Applications ──────────────────────────── */}
        <div className="w-64 shrink-0 sticky top-6">
          <div className="rounded-xl p-3" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="flex items-center justify-between pb-2 mb-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <span className="text-[11px] font-semibold text-slate-700">📋 My KYC Applications</span>
              <span className="text-[10px] text-slate-400">{myRecords.length} item(s)</span>
            </div>
            {recordsLoading ? (
              <p className="text-[11px] text-slate-400 text-center py-4">Loading…</p>
            ) : myRecords.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">No applications yet</p>
            ) : (
              <div className="space-y-1.5">
                {myRecords.map((rec) => {
                  const s = STATUS_MAP[rec.status] ?? STATUS_MAP.pending;
                  return (
                    <div key={rec.id} className="rounded-lg px-2.5 py-2 cursor-pointer transition-shadow hover:shadow-sm"
                      onClick={() => handleSelectRecord(rec)}
                      style={{ background: selectedRecord?.id === rec.id ? s.bg : "#fafafa", border: `1px solid ${selectedRecord?.id === rec.id ? s.border : "rgba(0,0,0,0.08)"}`, outline: selectedRecord?.id === rec.id ? `2px solid ${s.color}` : "none" }}>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <code className="text-[11px] font-mono font-semibold" style={{ color: s.color }}>{rec.id}</code>
                        <span className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 truncate">{rec.fullName}</div>
                      {rec.aiScore !== null && (
                        <div className="text-[10px] font-mono mt-0.5"
                          style={{ color: rec.aiScore >= 70 ? "#16a34a" : "#dc2626" }}>
                          AI Score: {rec.aiScore}/100
                        </div>
                      )}
                      {rec.reviewNotes && rec.reviewNotes.trim() && (
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{rec.reviewNotes}</div>
                      )}
                      {rec.txHash && (
                        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">✓ On-chain whitelisted</div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(rec.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" onClick={refreshRecords}
              className="w-full mt-2 text-[10px] text-slate-500 hover:text-slate-700 py-1.5 rounded transition-colors"
              style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
              Refresh
            </button>
            <a href="/admin/kyc"
              className="block w-full mt-1.5 text-center text-[10px] text-blue-600 hover:underline py-1.5 rounded transition-colors"
              style={{ border: "1px solid rgba(59,130,246,0.2)" }}>
              Admin Review Portal →
            </a>
          </div>
        </div>

        {/* ── Main form area ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

      {/* Page header */}
      <div className="mb-8 pb-5" style={{ borderBottom: "1px solid #152538" }}>
        <h1 className="text-2xl font-bold text-gray-900">Investor KYC Application</h1>
        <p className="text-sm text-slate-600 mt-1.5 max-w-xl">
          Complete AMLO (Cap. 615)-compliant identity verification to subscribe to HIBT.
          Your wallet will be whitelisted on{" "}
          <span className="font-mono text-blue-400 text-xs">IdentityRegistry.sol</span>{" "}
          after document review.
        </p>
      </div>

      {/* Selected record status banner */}
      {selectedRecord && selectedRecord.status !== "approved" && step !== 4 && (
        <div className="mb-5 rounded-lg px-4 py-3 flex items-start gap-3"
          style={{
            background: STATUS_MAP[selectedRecord.status]?.bg ?? "rgba(0,0,0,0.04)",
            border: `1px solid ${STATUS_MAP[selectedRecord.status]?.border ?? "rgba(0,0,0,0.10)"}`,
          }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-[12px] font-mono font-bold" style={{ color: STATUS_MAP[selectedRecord.status]?.color }}>{selectedRecord.id}</code>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: STATUS_MAP[selectedRecord.status]?.color, background: STATUS_MAP[selectedRecord.status]?.bg, border: `1px solid ${STATUS_MAP[selectedRecord.status]?.border}` }}>
                {STATUS_MAP[selectedRecord.status]?.label}
              </span>
              {selectedRecord.aiScore !== null && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ background: "rgba(0,0,0,0.06)", color: selectedRecord.aiScore >= 70 ? "#16a34a" : "#dc2626" }}>
                  AI Score: {selectedRecord.aiScore}/100
                </span>
              )}
            </div>
            {selectedRecord.aiSummary && (
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{selectedRecord.aiSummary}</p>
            )}
            {selectedRecord.reviewNotes?.trim() && (
              <p className="text-[11px] text-slate-500 mt-0.5"><span className="font-semibold">Officer notes: </span>{selectedRecord.reviewNotes}</p>
            )}
            {selectedRecord.status === "rejected" && (
              <p className="text-[11px] font-semibold mt-1" style={{ color: "#dc2626" }}>This application has been rejected. Please revise and resubmit.</p>
            )}
          </div>
          <button type="button" className="text-[10px] text-slate-400 hover:text-slate-600 shrink-0" onClick={() => { setSelectedRecord(null); setStep(1); setAppId(null); }}>✕ Clear</button>
        </div>
      )}

      {/* Step progress */}
      <div className="flex items-center gap-0 mb-2">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step;
          const done    = step > n;
          const active  = step === n;
          return (
            <div key={n} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={{
                    background: done ? "#16a34a" : active ? "#1d4ed8" : "#ffffff",
                    border: `1px solid ${done ? "#16a34a" : active ? "#1a56db" : "rgba(0,0,0,0.12)"}`,
                    color: done || active ? "white" : "#888888",
                  }}>
                  {done ? "..." : n}
                </div>
                <span className="text-[9px] text-center whitespace-nowrap"
                  style={{ color: active ? "#93c5fd" : done ? "#6ee7b7" : "#888888" }}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 h-px mx-1 mb-4 transition-colors"
                  style={{ background: step > n ? "#16a34a" : "rgba(0,0,0,0.12)" }} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-600 text-right mb-6">
        Step {Math.min(step, STEP_LABELS.length)} of {STEP_LABELS.length}
      </p>

      {/* ── STEP 1: Investor Profile ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-gray-900">Investor Profile</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">
                Full Legal Name <span className="text-red-400">*</span>
              </label>
              <input
                className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none transition-colors"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                placeholder="As on passport / HKID"
                value={form.fullName}
                onChange={(e) => setField("fullName", e.target.value)}
                onFocus={(e)  => (e.currentTarget.style.borderColor = "#1a56db")}
                onBlur={(e)   => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">
                Email Address <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none transition-colors"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                placeholder="institutional@example.com"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                onFocus={(e)  => (e.currentTarget.style.borderColor = "#1a56db")}
                onBlur={(e)   => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">
                Date of Birth <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none transition-colors"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                value={form.dateOfBirth}
                onChange={(e) => setField("dateOfBirth", e.target.value)}
                onFocus={(e)  => (e.currentTarget.style.borderColor = "#1a56db")}
                onBlur={(e)   => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">
                Phone Number <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none transition-colors"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                placeholder="+852 xxxx xxxx"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                onFocus={(e)  => (e.currentTarget.style.borderColor = "#1a56db")}
                onBlur={(e)   => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Country of Residence</label>
              <select
                className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                value={form.jurisdiction}
                onChange={(e) => setField("jurisdiction", e.target.value)}
              >
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>{j.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Tax Residency (CRS)</label>
              <select
                className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                value={form.taxResidency}
                onChange={(e) => setField("taxResidency", e.target.value)}
              >
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>{j.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">CRS / FATCA reporting jurisdiction</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">
              Occupation / Employer <span className="text-red-400">*</span>
            </label>
            <input
              className="w-full text-sm rounded px-3 py-2.5 text-slate-800 outline-none transition-colors"
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
              placeholder={form.investorType === "individual" ? "e.g. Director, ABC Investment Ltd" : "e.g. Harbour Capital Management Ltd"}
              value={form.occupation}
              onChange={(e) => setField("occupation", e.target.value)}
              onFocus={(e)  => (e.currentTarget.style.borderColor = "#1a56db")}
              onBlur={(e)   => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
            />
            <p className="text-[10px] text-slate-500 mt-1">Required for source of wealth assessment under AMLO Cap. 615</p>
          </div>

          {/* Investor type */}
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-2">Investor Type</label>
            <div className="flex gap-0 rounded overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.10)", width: "fit-content" }}>
              {([["individual", "Individual PI"], ["institutional", "Institutional PI"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setField("investorType", val)}
                  className="px-5 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: form.investorType === val ? "#1d4ed8" : "#ffffff",
                    color: form.investorType === val ? "white" : "#666666",
                    borderRight: val === "individual" ? "1px solid rgba(0,0,0,0.10)" : "none",
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">
              {form.investorType === "individual"
                ? "Individual: Net assets >= USD 1,000,000 (Schedule 1, SFO)"
                : "Institutional: SFC-licensed firm, insurer, bank, MPF trustee, or equivalent"}
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid()}
              className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: KYC Documents ────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-gray-900">KYC Documents</h2>
          <p className="text-xs text-slate-500 leading-relaxed -mt-2">
            Required per AMLO Cap. 615. All documents are encrypted and retained for 7 years minimum.
          </p>

          <FileUpload
            label="Government-Issued Photo ID"
            required
            hint={form.investorType === "individual"
              ? "Valid National Identity Card or international passport (photo page)"
              : "Company certificate of incorporation or business registration certificate"}
            file={govId}
            onFile={setGovId}
            onClear={() => setGovId(null)}
          />

          <FileUpload
            label="Proof of Address"
            required
            hint="Utility bill or bank statement dated within 3 months, showing full name and address"
            file={proofAddr}
            onFile={setProofAddr}
            onClear={() => setProofAddr(null)}
          />

          <FileUpload
            label={form.investorType === "individual"
              ? "Professional Investor Eligibility Evidence"
              : "Institutional PI Status Evidence"}
            required
            hint={form.investorType === "individual"
              ? "Bank statement, investment portfolio statement, or audited accounts showing net assets >= USD 1,000,000"
              : "SFC licence, banking licence, insurance authorisation, or MPF trustee approval letter"}
            file={piEvidence}
            onFile={setPiEvidence}
            onClear={() => setPiEvidence(null)}
          />

          {needsSoF && (
            <div className="rounded p-3 -mx-1"
              style={{ background: "#f3f1eb", border: "1px solid rgba(0,0,0,0.10)" }}>
              <div className="text-[11px] text-amber-300 font-semibold mb-2">
                Source of Funds Declaration Required
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Institutional Professional Investors are required to submit a Source of Funds declaration
                per AMLO Cap. 615 and FATF Recommendation 10.
              </p>
              <FileUpload
                label="Source of Funds Declaration"
                required
                hint="Signed letter on headed paper declaring origin of subscription funds"
                file={sofDecl}
                onFile={setSofDecl}
                onClear={() => setSofDecl(null)}
              />
            </div>
          )}

          {/* PEP Declaration */}
          <div className="flex items-start gap-3 pt-1">
            <input
              type="checkbox" id="pep" checked={pepChecked}
              onChange={(e) => setPepChecked(e.target.checked)}
              className="mt-0.5 shrink-0 accent-blue-500"
            />
            <label htmlFor="pep" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
              I confirm that I am <span className="text-slate-800 font-medium">not</span> a Politically Exposed Person (PEP)
              or closely associated with a PEP, or if I am, I have disclosed this in the Source of Funds declaration.
              (Screening performed via Refinitiv World-Check)
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button onClick={() => setStep(1)}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-400 transition-colors hover:text-white"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!step2Valid() || !pepChecked}
              className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Wallet & Consent ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-gray-900">Wallet Registration & Consent</h2>

          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">
              Mantle Network Wallet Address <span className="text-red-400">*</span>
            </label>
            <p className="text-[11px] text-slate-500 mb-1 leading-relaxed">
              Your wallet address is like your bank account number on the blockchain ...it starts with ...x...and is 42 characters long.
              This address will be whitelisted in HarbourRWA’s investor registry so only you can hold HIBT tokens.
            </p>
            <p className="text-[11px] text-slate-600 mb-2">
              Don’t have a wallet yet?{" "}
              <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                Get a Web3 wallet
              </a>
            </p>
            <input
              className="w-full font-mono text-sm rounded px-3 py-2.5 text-slate-800 outline-none transition-colors"
              style={{
                background: form.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(form.walletAddress) ? "rgba(22,163,74,0.07)" : "#ffffff",
                border: `1px solid ${form.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(form.walletAddress) ? "#16a34a" : "rgba(0,0,0,0.10)"}`,
                color: form.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(form.walletAddress) ? "#15803d" : undefined,
              }}
              placeholder="0x0000000000000000000000000000000000000000"
              value={form.walletAddress}
              readOnly={!!(wallet || (form.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(form.walletAddress)))}
              onChange={(e) => !wallet && setField("walletAddress", e.target.value)}
              onFocus={(e)  => { if (!wallet) e.currentTarget.style.borderColor = "#1a56db"; }}
              onBlur={(e)   => { if (!wallet) e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"; }}
            />
            {form.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(form.walletAddress) && (
              <p className="text-[10px] text-emerald-600 mt-0.5">Auto-filled from connected wallet</p>
            )}
            {form.walletAddress && !/^0x[0-9a-fA-F]{40}$/.test(form.walletAddress) && (
              <p className="text-[11px] text-red-400 mt-1">Invalid address ...must be 42 characters starting with 0x</p>
            )}
            {!form.walletAddress && (
              <button
                type="button"
                onClick={() => void connect()}
                className="mt-2 text-[11px] px-2.5 py-1 rounded transition-colors hover:text-blue-300"
                style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "#1a56db" }}
              >
                Connect wallet to auto-fill
              </button>
            )}
          </div>

          {/* Submission summary */}
          <div className="rounded p-4 text-xs space-y-2"
            style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-3">Application Summary</div>
            {[
              ["Name",          form.fullName],
              ["Email",         form.email],
              ["Jurisdiction",  form.jurisdiction],
              ["Investor Type", form.investorType === "individual" ? "Individual PI" : "Institutional PI"],
              ["Occupation",    form.occupation],
              ["Tax Residency", form.taxResidency],
              ["Gov. ID",       govId?.name ?? "--"],
              ["Proof of Addr", proofAddr?.name ?? "--"],
              ["PI Evidence",   piEvidence?.name ?? "--"],
              ...(needsSoF ? [["Source of Funds", sofDecl?.name ?? "--"] as [string, string]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <span className="text-slate-600 w-28 shrink-0">{k}</span>
                <span className="text-slate-300 truncate">{v}</span>
              </div>
            ))}
          </div>

          {/* Consents */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox" id="consent-amlo" checked={form.consentAmlo}
                onChange={(e) => setField("consentAmlo", e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500"
              />
              <label htmlFor="consent-amlo" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
                I consent to identity verification, AML/CFT screening, and ongoing transaction monitoring
                under AMLO (Cap. 615) and the FATF Recommendations. I confirm all submitted information
                is accurate and complete.
              </label>
            </div>
            <div className="flex items-start gap-3">
              <input
                type="checkbox" id="consent-retention" checked={form.consentRetention}
                onChange={(e) => setField("consentRetention", e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500"
              />
              <label htmlFor="consent-retention" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
                I acknowledge that KYC records will be retained for a minimum of 7 years per AMLO
                requirements, and that my wallet address will be permanently recorded on Mantle Network
                blockchain in the{" "}
                <code className="text-blue-400">IdentityRegistry.sol</code> contract.
              </label>
            </div>
          </div>

          {submitError && (
            <div className="text-sm text-red-300 rounded p-3"
              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {submitError}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            <button onClick={() => setStep(2)}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-400 transition-colors hover:text-white"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Back
            </button>
            <button
              onClick={submit}
              disabled={!step3Valid() || submitting || selectedRecord?.status === "approved"}
              className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              {submitting ? "Registering on-chain..." : selectedRecord?.status === "approved" ? "Already Approved" : "Submit KYC Application"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Confirmation ─────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5">
          {/* Success header */}
          <div className="rounded p-6 text-center space-y-3" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: "rgba(22,163,74,0.07)", border: "1px solid #16a34a" }}>
              <span className="text-emerald-400 text-2xl font-bold">&#10003;</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">KYC Application Submitted</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              Your application has been forwarded to the compliance team for review.
              You will be notified once your wallet is whitelisted on{" "}
              <code className="text-blue-400">IdentityRegistry.sol</code>.
            </p>
            {appId && (
              <div className="inline-flex items-center gap-2 rounded px-4 py-2 text-xs"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                <span className="text-slate-500">Application Ref:</span>
                <code className="font-mono text-blue-400">{appId}</code>
              </div>
            )}
          </div>

          {/* Review pipeline */}
          <div className="rounded p-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-4">
              KYC Review Pipeline
            </div>
            <div className="space-y-0">
              {[
                {
                  stage:    "1",
                  label:    "Application Received",
                  note:     "KYC package logged in compliance system",
                  status:   "done",
                  timeline: "Instant",
                },
                {
                  stage:    "2",
                  label:    "Document Format Check",
                  note:     "Automated check of file types, readability, and completeness",
                  status:   "done",
                  timeline: "< 1 hour",
                },
                {
                  stage:    "3",
                  label:    "Identity & Address Verification",
                  note:     "Manual review by Harbour Capital compliance team",
                  status:   "active",
                  timeline: "2-3 business days",
                },
                {
                  stage:    "4",
                  label:    "PEP & Sanctions Screening",
                  note:     "Refinitiv World-Check automated AML/CFT screening",
                  status:   "pending",
                  timeline: "Automated",
                },
                {
                  stage:    "5",
                  label:    "AI Compliance Scoring",
                  note:     "ComplianceOracle.sol generates on-chain score -- minimum 70/100 to proceed",
                  status:   "pending",
                  timeline: "On-chain",
                },
                {
                  stage:    "6",
                  label:    "Final Approval & Whitelist",
                  note:     "Compliance officer approves; wallet activated in IdentityRegistry.sol",
                  status:   "pending",
                  timeline: "1 business day",
                },
              ].map((item, idx, arr) => {
                const iconBg =
                  item.status === "done"   ? "rgba(22,163,74,0.07)" :
                  item.status === "active" ? "#ffffff" : "#ffffff";
                const iconBorder =
                  item.status === "done"   ? "#16a34a" :
                  item.status === "active" ? "#1a56db" : "rgba(0,0,0,0.12)";
                const iconColor =
                  item.status === "done"   ? "#4ade80" :
                  item.status === "active" ? "#93c5fd" : "#888888";
                const lineBg =
                  item.status === "done" ? "#16a34a" : "rgba(0,0,0,0.12)";
                return (
                  <div key={item.stage} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                        style={{ background: iconBg, border: `1px solid ${iconBorder}`, color: iconColor }}>
                        {item.status === "done" ? "..." : item.stage}
                      </div>
                      {idx < arr.length - 1 && (
                        <div className="w-px flex-1 my-1" style={{ background: lineBg, minHeight: "1.25rem" }} />
                      )}
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold"
                          style={{ color: item.status === "active" ? "#93c5fd" : item.status === "done" ? "#86efac" : "#666666" }}>
                          {item.label}
                        </span>
                        <span className="text-[10px] rounded-full px-2 py-0.5 font-medium"
                          style={{
                            background: item.status === "done" ? "rgba(22,163,74,0.12)" : item.status === "active" ? "rgba(59,130,246,0.12)" : "rgba(30,50,75,0.6)",
                            color: item.status === "done" ? "#4ade80" : item.status === "active" ? "#93c5fd" : "#888888",
                            border: `1px solid ${item.status === "done" ? "rgba(22,163,74,0.3)" : item.status === "active" ? "rgba(59,130,246,0.3)" : "rgba(0,0,0,0.12)"}`,
                          }}>
                          {item.status === "done" ? "Completed" : item.status === "active" ? "In Progress" : "Pending"}
                        </span>
                        <span className="text-[10px] text-slate-700 ml-auto">{item.timeline}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{item.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next action */}
          <div className="rounded p-4 text-xs" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-3">
              After KYC Approval
            </div>
            <div className="space-y-1.5 text-slate-500">
              <p>You will receive an email notification at <span className="text-blue-400">{form.email || "your registered email"}</span> once the review is complete.</p>
              <p>Upon final approval, your wallet will be whitelisted and you may proceed to the subscription portal.</p>
              <p className="text-slate-700">Questions: <a href="mailto:institutional@harbourcapital.hk" className="hover:underline">institutional@harbourcapital.hk</a></p>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <a href="mailto:institutional@harbourcapital.hk"
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-300 transition-colors hover:text-white"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Email Placement Agent
            </a>
          </div>

          <p className="text-[10px] text-slate-700 text-center pt-1">
            SFC Authorisation Ref: SFC/HIBT/2026-B/001 &middot; Subscription Deadline: 30 Jun 2026 17:00 HKT
          </p>
        </div>
      )}

        </div>{/* end main form area */}
      </div>{/* end flex row */}
    </div>
  );
}
