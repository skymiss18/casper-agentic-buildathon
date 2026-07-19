"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { getCasperWalletProvider } from "@/lib/casper-wallet";

type AssetType = "Bond" | "GreenBond" | "REIT" | "TradeReceivable";
const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "Bond",             label: "Bond"              },
  { value: "GreenBond",        label: "Green Bond"        },
  { value: "REIT",             label: "REIT"              },
  { value: "TradeReceivable",  label: "Trade Receivable"  },
];

type AppStatus = "Pending SFC Review" | "Approved" | "Changes Required";
type FilterType = "All" | AppStatus | "Deployed";

interface SFCRecord {
  id: string;
  asset: string;
  type: string;
  issuer: string;
  submitted: string;
  complianceScore: number;
  auditHash: string;
  totalIssuance: string;
  currency: string;
  status: AppStatus;
  notes?: string;
  approvedTx?: string;
  approvedAt?: string;
  approvedBy?: string;
  sfcRef?: string;
  prospectusExcerpt?: string;
}

interface DeployResult {
  txHash?: string;
  deployHash?: string;
  registrationId?: string;
  assetId?: string;
  assetName?: string;
  symbol?: string;
  contractHash?: string;
  contractAddress?: string;
  blockNumber?: number | null;
  network: string;
  deployedAt: string;
  standard: string;
  gasUsed?: number | null;
  explorerUrl?: string;
  status?: string;
  pendingReason?: string;
  identityRegistry?: DeployResult;
}

const STATUS_CFG: Record<AppStatus, { color: string; bg: string; border: string; dot: string; label: string }> = {
  "Pending SFC Review": { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.3)",  dot: "bg-amber-400",   label: "Pending" },
  "Approved":           { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.3)",  dot: "bg-emerald-400", label: "Approved" },
  "Changes Required":   { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", dot: "bg-red-400",     label: "Changes" },
};

function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

function normalizeDeployResult(deploy: DeployResult): DeployResult {
  const legacyEvm = /mantle/i.test(deploy.network ?? "") || /mantlescan/i.test(deploy.explorerUrl ?? "");
  if (!legacyEvm) {
    return deploy.identityRegistry
      ? { ...deploy, identityRegistry: normalizeDeployResult(deploy.identityRegistry) }
      : deploy;
  }

  return {
    ...deploy,
    registrationId: deploy.registrationId ?? deploy.txHash,
    contractHash: deploy.contractHash,
    network: "Casper Testnet",
    standard: "Casper Native RWA Issuance",
    status: deploy.status ?? "Registered",
    explorerUrl: undefined,
    ...(deploy.identityRegistry ? { identityRegistry: normalizeDeployResult(deploy.identityRegistry) } : {}),
  };
}

function formatPendingIdentityRegistryMessage(identityRegistry: DeployResult) {
  return identityRegistry.pendingReason
    ? `Identity registry deploy submitted but contract hash is not finalized yet. ${identityRegistry.pendingReason}`
    : "Identity registry deploy submitted but contract hash is not finalized yet. Retry once Casper finality catches up.";
}

export default function TokenizePage() {
  // ── view toggle ──────────────────────────────────────────────────────────
  const [view, setView] = useState<"submit" | "deploy">("deploy");

  // ── submission form state ─────────────────────────────────────────────────
  const [form, setForm] = useState({
    assetName:  "",
    assetType:  "Bond" as AssetType,
    description: "",
    unitPrice: "",
    totalSupply: "",
    prospectusText: "",
  });
  const [submitting,    setSubmitting]    = useState(false);
  const [submitResult,  setSubmitResult]  = useState<{ id: string } | null>(null);
  const [submitError,   setSubmitError]   = useState<string | null>(null);

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assetName.trim() || !form.unitPrice.trim() || !form.totalSupply.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/sponsor-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName:      form.assetName.trim(),
          assetType:      form.assetType,
          description:    form.description.trim(),
          unitPrice:      form.unitPrice.trim(),
          totalSupply:    form.totalSupply.trim(),
          prospectusText: form.prospectusText.trim(),
          issuer:         "Nexus Capital Markets Corporation Limited",
          submittedAt:    new Date().toISOString(),
        }),
      });
      const data = await res.json() as { success: boolean; id: string };
      if (!res.ok || !data.success) throw new Error("Submission failed");
      setSubmitResult({ id: data.id });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed, please retry");
    } finally {
      setSubmitting(false);
    }
  }

  // ── deployment state ──────────────────────────────────────────────────────
  const [records,          setRecords]          = useState<SFCRecord[]>([]);
  const [selected,         setSelected]         = useState<SFCRecord | null>(null);
  const [filter,           setFilter]           = useState<FilterType>("All");
  const [loading,          setLoading]          = useState(true);
  const [deploying,        setDeploying]        = useState(false);
  const [deployMap,        setDeployMap]        = useState<Record<string, DeployResult>>({});
  const [deployError,      setDeployError]      = useState<string | null>(null);
  const [walletPublicKey,  setWalletPublicKey]  = useState<string | null>(null);
  const [deployStep,       setDeployStep]       = useState<"idle" | "connecting" | "signingIdentity" | "broadcastingIdentity" | "signingToken" | "broadcastingToken">("idle");

  async function waitForIdentityRegistryContractHash(recordId: string, attempts = 15, intervalMs = 3_000) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetch("/api/tokenize/deployments", { cache: "no-store" });
      if (response.ok) {
        const deployments = await response.json() as Record<string, DeployResult>;
        const identityRegistry = deployments[recordId]?.identityRegistry;
        if (identityRegistry?.contractHash?.trim() || identityRegistry?.status === "Failed") {
          return identityRegistry;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return null;
  }

  async function loadRecords() {
    setLoading(true);
    try {
      const [sfcRes, deplRes] = await Promise.all([
        fetch("/api/sfc-inbox"),
        fetch("/api/tokenize/deployments"),
      ]);
      const sfcData = await sfcRes.json();
      const rawDeployments = await deplRes.json() as Record<string, DeployResult>;
      const deplData = Object.fromEntries(
        Object.entries(rawDeployments).map(([id, deployment]) => [id, normalizeDeployResult(deployment)])
      ) as Record<string, DeployResult>;
      const recs: SFCRecord[] = sfcData.submissions ?? [];
      setRecords(recs);
      setDeployMap(deplData);
      setSelected((prev) => prev ?? recs.find((r) => r.status === "Approved") ?? recs[0] ?? null);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function start() {
      await Promise.resolve();
      if (active) {
        await loadRecords();
      }
    }

    void start();

    return () => {
      active = false;
    };
  }, []);

  async function handleDeploy() {
    if (!selected || deploying) return;
    setDeployError(null);
    setDeploying(true);

    try {
      // Step 1 — connect Casper Wallet and get public key
      setDeployStep("connecting");
      const walletProvider = getCasperWalletProvider();
      let pubKey = walletPublicKey;
      if (!pubKey) {
        await walletProvider.requestConnection();
        pubKey = await walletProvider.getActivePublicKey();
        if (!pubKey) throw new Error("Casper Wallet did not return a public key");
        setWalletPublicKey(pubKey);
      }

      let currentDeployment = deployMap[selected.id];
      let identityEntry = currentDeployment?.identityRegistry;

      if (identityEntry && !identityEntry.contractHash && identityEntry.status !== "Failed") {
        setDeployStep("broadcastingIdentity");
        const reconciledIdentity = await waitForIdentityRegistryContractHash(selected.id);
        if (reconciledIdentity) {
          identityEntry = {
            ...identityEntry,
            ...reconciledIdentity,
          };
          currentDeployment = {
            ...(currentDeployment ?? {} as DeployResult),
            identityRegistry: identityEntry,
          };
          setDeployMap((prev) => ({
            ...prev,
            [selected.id]: {
              ...(prev[selected.id] ?? {} as DeployResult),
              identityRegistry: identityEntry,
            },
          }));
        }
      }

      const identityDeployReference = identityEntry?.deployHash ?? identityEntry?.txHash ?? identityEntry?.registrationId;

      if (identityEntry && !identityEntry.contractHash && identityEntry.status !== "Failed" && identityDeployReference) {
        throw new Error(formatPendingIdentityRegistryMessage(identityEntry));
      }

      if (!identityEntry?.contractHash) {
        setDeployStep("signingIdentity");
        const identityPrepareBody = {
          signerPublicKey: pubKey,
          id: selected.id,
          assetName: selected.asset,
        };
        const identityPrepRes = await fetch("/api/tokenize/prepare-identity-deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(identityPrepareBody),
        });
        const identityPrepData = await identityPrepRes.json() as { error?: string; deployJson?: Record<string, unknown>; deployToken?: string };
        if (!identityPrepRes.ok || identityPrepData.error) {
          throw new Error(identityPrepData.error ?? "Failed to prepare identity-registry deploy");
        }

        const identitySigResult = await walletProvider.sign(JSON.stringify(identityPrepData.deployJson), pubKey);
        if (identitySigResult.cancelled) throw new Error("Identity-registry signing cancelled by user");
        if (!identitySigResult.signatureHex) throw new Error("Casper Wallet did not return an identity-registry signature");

        setDeployStep("broadcastingIdentity");
        const identityBroadRes = await fetch("/api/tokenize/broadcast-identity-deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deployToken: identityPrepData.deployToken,
            signatureHex: identitySigResult.signatureHex,
            signerPublicKey: pubKey,
            id: selected.id,
            assetName: selected.asset,
          }),
        });
        const identityData = await identityBroadRes.json() as DeployResult & { error?: string };
        if (!identityBroadRes.ok || identityData.error) {
          throw new Error(identityData.error ?? "Identity-registry broadcast failed");
        }

        identityEntry = {
          txHash: identityData.txHash,
          deployHash: identityData.deployHash,
          registrationId: identityData.registrationId,
          assetId: identityData.assetId,
          assetName: identityData.assetName ?? selected.asset,
          contractHash: identityData.contractHash,
          contractAddress: identityData.contractAddress,
          blockNumber: identityData.blockNumber,
          network: identityData.network,
          deployedAt: identityData.deployedAt,
          standard: identityData.standard,
          gasUsed: identityData.gasUsed,
          explorerUrl: identityData.explorerUrl,
          status: identityData.status,
          pendingReason: identityData.pendingReason,
        };

        await fetch("/api/tokenize/deployments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, identityRegistry: identityEntry }),
        });

        if (!identityEntry.contractHash) {
          const reconciledIdentity = await waitForIdentityRegistryContractHash(selected.id);
          if (!reconciledIdentity?.contractHash) {
            if (reconciledIdentity?.status === "Failed") {
              throw new Error(reconciledIdentity.pendingReason ?? "Identity registry deploy failed on Casper.");
            }

            throw new Error(formatPendingIdentityRegistryMessage(identityEntry));
          }

          identityEntry.contractHash = reconciledIdentity.contractHash;
          identityEntry.contractAddress = reconciledIdentity.contractAddress;
          identityEntry.status = reconciledIdentity.status;
          identityEntry.pendingReason = reconciledIdentity.pendingReason;
          identityEntry.explorerUrl = reconciledIdentity.explorerUrl ?? identityEntry.explorerUrl;
        }

        currentDeployment = {
          ...(currentDeployment ?? {} as DeployResult),
          identityRegistry: identityEntry,
        };
        setDeployMap((prev) => ({
          ...prev,
          [selected.id]: {
            ...(prev[selected.id] ?? {} as DeployResult),
            identityRegistry: identityEntry,
          },
        }));
      }

      // Step 2 — ask server to build unsigned Casper transaction with wallet's public key
      setDeployStep("signingToken");
      const prepareBody = {
        signerPublicKey: pubKey,
        id: selected.id,
        assetName: selected.asset,
        assetType: selected.type,
        issuer: selected.issuer,
        sfcRef: selected.sfcRef,
        totalIssuance: selected.totalIssuance,
        currency: selected.currency,
      };
      console.log("📤 Sending to /api/tokenize/prepare-deploy:", prepareBody);
      const prepRes = await fetch("/api/tokenize/prepare-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepareBody),
      });
      const prepData = await prepRes.json() as { success?: boolean; error?: string; deployJson?: Record<string, unknown>; deployToken?: string; deployHash?: string; paymentCSPR?: string };
      console.log("📥 Response from prepare-deploy:", prepData);
      if (!prepRes.ok || prepData.error) throw new Error(prepData.error ?? "Failed to prepare deploy");

      // Step 3 — ask Casper Wallet to sign the transaction
      console.log("📝 Sending to Casper Wallet for signing:", prepData.deployJson);
      const sigResult = await walletProvider.sign(JSON.stringify(prepData.deployJson), pubKey);
      if (sigResult.cancelled) throw new Error("Signing cancelled by user");
      const signatureHex = sigResult.signatureHex;
      if (!signatureHex) throw new Error("Casper Wallet did not return a signature");
      console.log("✅ Signature received from wallet:", signatureHex);

      // Step 4 — send signed deploy to server for broadcast (use token to avoid large payload)
      setDeployStep("broadcastingToken");
      const broadcastBody = {
        deployToken: prepData.deployToken,
        signatureHex,
        signerPublicKey: pubKey,
        id: selected.id,
        assetName: selected.asset,
        assetType: selected.type,
        issuer: selected.issuer,
        sfcRef: selected.sfcRef,
        totalIssuance: selected.totalIssuance,
        currency: selected.currency,
      };
      console.log("📤 Sending to /api/tokenize/broadcast-deploy:", broadcastBody);
      const broadRes = await fetch("/api/tokenize/broadcast-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(broadcastBody),
      });
      const data = await broadRes.json() as DeployResult & { success?: boolean; error?: string };
      console.log("📥 Response from broadcast-deploy:", data);
      if (!broadRes.ok || data.error) throw new Error(data.error ?? "Casper broadcast failed");

      const newEntry: DeployResult = {
        txHash: data.txHash,
        deployHash: data.deployHash,
        registrationId: data.registrationId,
        assetId: data.assetId,
        assetName: data.assetName ?? selected.asset,
        symbol: data.symbol,
        contractHash: data.contractHash,
        contractAddress: data.contractAddress,
        blockNumber: data.blockNumber,
        network: data.network,
        deployedAt: data.deployedAt,
        standard: data.standard,
        gasUsed: data.gasUsed,
        explorerUrl: data.explorerUrl,
        status: data.status,
        pendingReason: data.pendingReason,
      };
      await fetch("/api/tokenize/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, deployment: newEntry, identityRegistry: currentDeployment?.identityRegistry }),
      });
      setDeployMap((prev) => ({
        ...prev,
        [selected.id]: {
          ...newEntry,
          identityRegistry: currentDeployment?.identityRegistry,
        },
      }));
    } catch (err) {
      console.warn("handleDeploy failed:", err instanceof Error ? err.message : String(err));
      setDeployError(err instanceof Error ? err.message : "Casper registration failed, please retry");
    } finally {
      setDeploying(false);
      setDeployStep("idle");
    }
  }

  const counts = {
    All: records.length,
    "Approved": records.filter((r) => r.status === "Approved").length,
    "Pending SFC Review": records.filter((r) => r.status === "Pending SFC Review").length,
    "Changes Required": records.filter((r) => r.status === "Changes Required").length,
    "Deployed": records.filter((r) => !!deployMap[r.id]).length,
  };
  const filtered = filter === "All"
    ? records
    : filter === "Deployed"
      ? records.filter((r) => !!deployMap[r.id])
      : records.filter((r) => r.status === filter);
  const deploy = selected ? deployMap[selected.id] : null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Tokenise an Asset</h1>


      </div>

      {/* ══════════════════════════════════════════════════════════
          VIEW: Submit for Intermediary Review
      ══════════════════════════════════════════════════════════ */}
      {view === "submit" && (
        <div className="flex gap-6 items-start">

          {/* ── Left: form ─────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <button onClick={() => setView("deploy")}
              className="flex items-center gap-1.5 text-xs font-medium mb-4 transition-colors"
              style={{ color: "#6366f1" }}>
              ← Back to Deployment Portal
            </button>
            <div className="rounded-lg px-3 py-2.5 text-xs mb-5"
              style={{ background: "rgba(26,86,219,0.06)", border: "1px solid rgba(26,86,219,0.18)" }}>
              <span className="font-semibold text-blue-700 uppercase tracking-wide text-[10px]">Issuer · Asset Submission</span>
              <p className="text-slate-600 mt-1">
                Fill in the asset details and click <strong className="text-blue-700">Submit for Intermediary Review →</strong>.
                Your submission will appear in the Type&#160;6&#160;LC compliance queue at <a href="/compliance" className="underline text-blue-600">/compliance</a> for AI-assisted SFC review.
              </p>
            </div>

            {submitResult ? (
              <div className="rounded-xl p-8 text-center" style={{ background: "#ffffff", border: "1px solid rgba(16,185,129,0.3)" }}>
                <div className="text-3xl mb-3">✅</div>
                <h2 className="text-base font-bold text-emerald-700 mb-1">Submitted Successfully</h2>
                <p className="text-xs text-slate-500 mb-3">
                  Reference <span className="font-mono font-semibold text-slate-700">{submitResult.id}</span>
                </p>
                <p className="text-xs text-slate-500 mb-6">
                  The intermediary (Type&#160;6&#160;LC) will pick up your submission from the Sponsor Inbox at{" "}
                  <a href="/compliance" className="text-blue-600 underline">/compliance</a> and run an AI compliance check before filing with the SFC.
                </p>
                <div className="flex justify-center gap-3 flex-wrap">
                  <button onClick={() => { setSubmitResult(null); setForm({ assetName: "", assetType: "Bond", description: "", unitPrice: "", totalSupply: "", prospectusText: "" }); }}
                    className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                    style={{ background: "rgba(26,86,219,0.08)", border: "1px solid rgba(26,86,219,0.2)", color: "#1d4ed8" }}>
                    Submit another asset
                  </button>
                  <a href="/compliance"
                    className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
                    style={{ background: "#1d4ed8" }}>
                    Go to Compliance →
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
                <div className="rounded-xl p-5 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>

                  {/* Asset Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Asset Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.assetName}
                      onChange={(e) => setField("assetName", e.target.value)}
                      placeholder="e.g. Nexus Infrastructure Bond Token (NIBT)"
                      required
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: "#f9f8f6", border: "1px solid rgba(0,0,0,0.12)", color: "#111111" }}
                    />
                  </div>

                  {/* Asset Type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Asset Type</label>
                    <div className="flex gap-2 flex-wrap">
                      {ASSET_TYPES.map(({ value, label }) => (
                        <button type="button" key={value}
                          onClick={() => setField("assetType", value)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                          style={{
                            background: form.assetType === value ? "rgba(26,86,219,0.10)" : "rgba(0,0,0,0.03)",
                            border: `1px solid ${form.assetType === value ? "rgba(26,86,219,0.35)" : "rgba(0,0,0,0.10)"}`,
                            color: form.assetType === value ? "#1d4ed8" : "#555555",
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description</label>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setField("description", e.target.value)}
                      placeholder="Brief description of the asset, structure, and use of proceeds…"
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors resize-none"
                      style={{ background: "#f9f8f6", border: "1px solid rgba(0,0,0,0.12)", color: "#111111" }}
                    />
                  </div>

                  {/* Unit Price */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Unit Price (USD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.unitPrice}
                      onChange={(e) => setField("unitPrice", e.target.value)}
                      placeholder="e.g. 1000"
                      required
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: "#f9f8f6", border: "1px solid rgba(0,0,0,0.12)", color: "#111111" }}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">This configured unit price will be reused later on the subscription page.</p>
                  </div>

                  {/* Total Token Supply */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Total Token Supply <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.totalSupply}
                      onChange={(e) => setField("totalSupply", e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g. 100000"
                      required
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: "#f9f8f6", border: "1px solid rgba(0,0,0,0.12)", color: "#111111" }}
                    />
                    {form.assetType === "TradeReceivable" && (
                      <p className="text-[10px] text-slate-400 mt-1">Trade Receivable also requires Unit Price — fill that in the Compliance page.</p>
                    )}
                  </div>

                  {/* Prospectus */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-0.5">
                      Prospectus / Term Sheet
                      <span className="ml-1 font-normal text-slate-400">(optional — for Intermediary compliance review)</span>
                    </label>
                    <p className="text-[10px] text-slate-400 mb-1.5">
                      Paste the full text. The intermediary will see it in their Sponsor Inbox and can run AI compliance review immediately.
                    </p>
                    <textarea
                      rows={10}
                      value={form.prospectusText}
                      onChange={(e) => setField("prospectusText", e.target.value)}
                      placeholder={"PROSPECTUS — ...\n\nISSUER & ELIGIBILITY\n...\n\nBOND TERMS & STRUCTURE\n..."}
                      className="w-full rounded-lg px-3 py-2.5 text-xs font-mono outline-none transition-colors resize-y"
                      style={{ background: "#f9f8f6", border: "1px solid rgba(0,0,0,0.12)", color: "#333333", minHeight: 200 }}
                    />
                  </div>
                </div>

                {submitError && (
                  <div className="text-xs text-red-600 rounded-lg px-3 py-2"
                    style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    {submitError}
                  </div>
                )}

                <button type="submit" disabled={submitting || !form.assetName.trim() || !form.unitPrice.trim() || !form.totalSupply.trim()}
                  className="w-full py-3 text-sm font-bold text-white rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)" }}>
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Submitting…
                    </>
                  ) : "Submit for Intermediary Review →"}
                </button>
              </form>
            )}
          </div>

          {/* ── Right: workflow + links ───────────────────────────────────── */}
          <div className="w-80 shrink-0 sticky top-6 space-y-4">

            {/* Issuance workflow */}
            <div className="rounded-xl p-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Issuance Workflow</div>
              <ol className="space-y-3">
                {([
                  ["1", "#1d4ed8", "Submit for Review",      "You are here — fill in asset details and submit to intermediary Sponsor Inbox."],
                  ["2", "#6366f1", "AI Compliance Check",    "Type 6 LC runs SFC compliance review at /compliance and files with the regulator."],
                  ["3", "#7c3aed", "SFC Approval",           "SFC reviews the application at /regulator/issuance and grants authorisation."],
                  ["4", "#059669", "Register on Casper",       "Return to Step 2 tab — register the Casper issuance once SFC-approved."],
                ] as [string, string, string, string][]).map(([num, color, title, desc]) => (
                  <li key={num} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 text-white"
                      style={{ background: color }}>
                      {num}
                    </span>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-700">{title}</div>
                      <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Quick links */}
            <div className="rounded-xl p-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Quick Links</div>
              <div className="space-y-1.5">
                {([
                  ["/compliance",         "AI Compliance Check"],
                  ["/audit",              "Smart Contract Audit"],
                  ["/regulator/issuance", "SFC Issuance Queue"],
                  ["/prospectus",         "Generate Prospectus"],
                ] as [string, string][]).map(([href, label]) => (
                  <a key={href} href={href}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors group"
                    style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", color: "#555555" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(26,86,219,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}>
                    <span>{label}</span>
                    <span style={{ color: "#aaaaaa" }}>→</span>
                  </a>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          VIEW: Deployment Portal (existing content)
      ══════════════════════════════════════════════════════════ */}
      {view === "deploy" && (
      <div>
        {/* ── Issuance flow banner ── */}
        <div className="rounded-xl mb-5 overflow-hidden" style={{ background: "#ffffff", border: "1px solid rgba(99,102,241,0.18)", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
          {/* Top row: flow steps */}
          <div className="px-5 pt-4 pb-3 flex items-center gap-0 flex-wrap" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
            {([
              { n: "1", label: "Issuance Application", sub: "Fill in asset details & submit",          color: "#1d4ed8", bg: "rgba(29,78,216,0.10)" },
              { n: "2", label: "AI Compliance Review",  sub: "Intermediary runs AI compliance score",  color: "#7c3aed", bg: "rgba(124,58,237,0.09)" },
              { n: "3", label: "SFC Approval",          sub: "SFC reviews and authorises issuance",    color: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
              { n: "4", label: "On-Chain Deployment",   sub: "Register issuance on Casper Network",         color: "#10b981", bg: "rgba(16,185,129,0.10)" },
            ]).map((s, i, arr) => (
              <div key={s.n} className="flex items-center">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: s.bg }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: s.color }}>
                    {s.n}
                  </span>
                  <div>
                    <div className="text-[11px] font-semibold leading-none" style={{ color: s.color }}>{s.label}</div>
                    <div className="text-[10px] leading-snug mt-0.5" style={{ color: "#888888" }}>{s.sub}</div>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <span className="mx-1.5 text-slate-300 text-xs shrink-0">→</span>
                )}
              </div>
            ))}
            <div className="ml-auto pl-4">
              <button onClick={() => setView("submit")}
                className="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
                style={{ background: "#1d4ed8", color: "#ffffff" }}>
                Issuance Application →
              </button>
            </div>
          </div>

        </div>
        <div className="flex gap-5 items-start">
        {/* ── Left panel ── */}
        <div className="w-72 shrink-0 sticky top-6">
          <div className="rounded-xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="px-3 pt-3 pb-2 flex gap-1.5 flex-wrap" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {([
                ["All",               "All"],
                ["Deployed",          "Deployed"],
                ["Approved",          "Approved"],
                ["Pending SFC Review","Pending"],
                ["Changes Required",  "Changes"],
              ] as [string, string][]).map(([val, lbl]) => (
                <button key={val} onClick={() => setFilter(val as typeof filter)}
                  className="text-[10px] px-2.5 py-1 rounded-md transition-colors font-medium"
                  style={{
                    background: filter === val ? "rgba(99,102,241,0.12)" : "transparent",
                    border: `1px solid ${filter === val ? "rgba(99,102,241,0.4)" : "transparent"}`,
                    color: filter === val ? "#6366f1" : "#888888",
                  }}>
                  {lbl} <span className="opacity-60">{counts[val as keyof typeof counts]}</span>
                </button>
              ))}
            </div>
            <div>
              {loading ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">No records</div>
              ) : filtered.map((rec) => {
                const cfg = STATUS_CFG[rec.status];
                const isSelected = selected?.id === rec.id;
                const isDeployed = !!deployMap[rec.id];
                return (
                  <button key={rec.id} onClick={() => setSelected(rec)} className="w-full text-left px-3 py-3 transition-colors"
                    style={{
                      background: isSelected ? "rgba(99,102,241,0.06)" : "transparent",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      borderLeft: isSelected ? "3px solid #6366f1" : "3px solid transparent",
                    }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-semibold text-slate-800 leading-tight truncate">{rec.asset || "Unnamed"}</span>
                      {isDeployed
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0" style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)" }}>Deployed</span>
                        : <StatusBadge status={rec.status} />
                      }
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500">{rec.type}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-400">{rec.submitted}</span>
                    </div>
                    {rec.sfcRef && (
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{rec.sfcRef}</div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className="text-[10px]" style={{ color: cfg.color }}>{rec.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-2" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
              <button onClick={() => void loadRecords()}
                className="w-full text-[10px] text-slate-500 hover:text-slate-700 py-1.5 rounded transition-colors"
                style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="rounded-xl p-12 text-center" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)" }}>
              <div className="text-2xl mb-2">📋</div>
              <p className="text-sm text-slate-400">Select a record from the list to view details.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="rounded-xl px-5 py-4 flex items-start justify-between gap-4"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)" }}>
                <div>
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-800">{selected.asset}</h2>
                    <StatusBadge status={selected.status} />
                    {deploy && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)" }}>
                        ✓ Deployed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{selected.issuer} · {selected.id}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold" style={{ color: selected.complianceScore >= 70 ? "#10b981" : "#f59e0b" }}>
                    {selected.complianceScore}
                  </div>
                  <div className="text-[10px] text-slate-400">Compliance Score</div>
                </div>
              </div>

              {/* Detail cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-4 space-y-2.5"
                  style={{ background: selected.status === "Approved" ? "rgba(16,185,129,0.04)" : "rgba(245,158,11,0.04)", border: `1px solid ${selected.status === "Approved" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">SFC Authorisation</div>
                  {([
                    ["SFC Reference",  selected.sfcRef ?? "—"],
                    ["Approved by",    selected.approvedBy ?? "Pending review"],
                    ["Approval Date",  selected.approvedAt ?? "—"],
                    ["Submission",     selected.submitted],
                    ["Status",         selected.status],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-slate-500 shrink-0">{k}</span>
                      <span className={`font-mono text-right break-all ${k === "Status" ? (selected.status === "Approved" ? "text-emerald-700 font-bold" : "text-amber-600 font-bold") : "text-slate-700"}`}>{v}</span>
                    </div>
                  ))}
                  {selected.notes && (
                    <div className="text-[11px] text-red-600 rounded p-2 mt-1" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                      <span className="font-semibold">Changes: </span>{selected.notes}
                    </div>
                  )}
                </div>
                <div className="rounded-xl p-4 space-y-2.5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Issuance Details</div>
                  {([
                    ["Asset Type",       selected.type],
                    ["Total Issuance",   `${selected.totalIssuance} ${selected.currency}`],
                    ["Compliance Score", `${selected.complianceScore} / 100`],
                    ["Issuer",           selected.issuer || "—"],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-slate-500 shrink-0">{k}</span>
                      <span className={`font-mono text-right break-all ${k === "Compliance Score" ? (selected.complianceScore >= 70 ? "text-emerald-700 font-bold" : "text-amber-600 font-bold") : "text-slate-700"}`}>{v}</span>
                    </div>
                  ))}
                  {selected.auditHash && (
                    <div className="pt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <div className="text-[10px] text-slate-400 mb-0.5">Audit Hash</div>
                      <div className="font-mono text-[10px] text-slate-600 break-all">{selected.auditHash.slice(0, 42)}...</div>
                    </div>
                  )}
                </div>
              </div>

              {/* SFC on-chain approval tx */}
              {selected.approvedTx && (
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.2)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600 mb-1">SFC Approval Reference</div>
                  <div className="font-mono text-[11px] text-violet-700 break-all">{selected.approvedTx}</div>
                  <div className="text-[10px] text-violet-500 mt-0.5">Casper issuance registration is created in the next step.</div>
                </div>
              )}

              {/* Prospectus */}
              {selected.prospectusExcerpt && (
                <div className="rounded-xl px-4 py-3" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Prospectus Excerpt</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-4">{selected.prospectusExcerpt}</p>
                </div>
              )}

              {/* Deploy section */}
              {selected.status === "Approved" && !deploy && (
                <div className="rounded-xl p-5" style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-2">Register Casper Issuance · Casper Network</div>
                  <p className="text-xs text-slate-600 mb-4">SFC authorisation confirmed. Register this issuance on Casper Testnet, binding the SFC reference to the Casper compliance and identity workflow. This avoids the old Solidity deployment path.</p>

                  <div className="flex items-center gap-2 mb-3 text-[10px]" style={{ color: "#10b981" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="font-semibold">Casper Testnet</span>
                    <span className="text-slate-400">wallet-signed on-chain issuance · Casper Wallet required</span>
                    {walletPublicKey && (
                      <span className="ml-auto font-mono text-indigo-500 truncate max-w-[120px]" title={walletPublicKey}>🔑 {walletPublicKey.slice(0, 12)}…</span>
                    )}
                  </div>

                  {deployError && (
                    <div className="text-[11px] text-red-600 rounded-lg px-3 py-2 mb-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {deployError}
                    </div>
                  )}

                  {/* Step indicator when deploying */}
                  {deploying && (
                    <div className="flex items-center gap-2 text-[11px] text-indigo-600 rounded-lg px-3 py-2 mb-3" style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      {deployStep === "connecting" && "Connecting Casper Wallet…"}
                      {deployStep === "signingIdentity" && "Waiting for identity-registry wallet signature…"}
                      {deployStep === "broadcastingIdentity" && "Broadcasting identity-registry to Casper Testnet…"}
                      {deployStep === "signingToken" && "Waiting for token wallet signature…"}
                      {deployStep === "broadcastingToken" && "Broadcasting token deploy to Casper Testnet…"}
                    </div>
                  )}

                  <button onClick={handleDeploy} disabled={deploying}
                    className="w-full py-3 text-sm font-bold text-white rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
                    {deploying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {deployStep === "connecting"   && "Connecting Wallet…"}
                        {deployStep === "signingIdentity" && "Sign Identity Deploy…"}
                        {deployStep === "broadcastingIdentity" && "Broadcast Identity…"}
                        {deployStep === "signingToken" && "Sign Token Deploy…"}
                        {deployStep === "broadcastingToken" && "Broadcast Token…"}
                        {deployStep === "idle"         && "Registering…"}
                      </>
                    ) : walletPublicKey ? "🚀  Register on Casper →" : "🔗  Connect Wallet & Register →"}
                  </button>
                </div>
              )}

              {/* Deploy result */}
              {deploy && (
                <div className="rounded-xl p-5 space-y-4" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{deploy.status === "Deployed" ? "✅" : "🕐"}</span>
                    <div>
                      <div className="text-sm font-bold text-indigo-700">
                        Casper WASM Deploy {deploy.status === "Deployed" ? "On-Chain" : "Pending Broadcast"}
                      </div>
                      <div className="text-[10px] text-slate-500">{deploy.network} · {deploy.standard} · {deploy.deployedAt}</div>
                    </div>
                  </div>
                  {deploy.status !== "Deployed" && (
                    <div className="rounded-lg px-3 py-2.5 text-[11px]" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
                      <span className="font-semibold text-amber-700">Signed deploy saved locally.</span>
                      <span className="text-slate-600"> The Casper testnet RPC is currently unreachable from this network. The fully signed WASM deploy has been persisted to <code className="text-indigo-600">data/pending-deploys/</code> and will be broadcast automatically when connectivity is restored, or can be sent manually via <code className="text-indigo-600">casper-client put-deploy</code>.</span>
                    </div>
                  )}
                  <div className="space-y-2 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(99,102,241,0.15)" }}>
                    {([
                      ["Deploy Hash", deploy.deployHash ?? deploy.txHash ?? deploy.registrationId ?? "—"],
                      ["Casper Asset ID", deploy.assetId ?? "—"],
                      ...(deploy.contractHash ? [["Casper Contract Hash", deploy.contractHash]] : []),
                      ...(deploy.identityRegistry?.contractHash ? [["Identity Registry Hash", deploy.identityRegistry.contractHash]] : []),
                      ["Status", deploy.status === "Deployed" ? "On-Chain" : "Pending Broadcast"],
                      ["Standard", deploy.standard],
                      ["Network", deploy.network],
                      ["Submitted At", deploy.deployedAt],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 text-[11px]">
                        <span className="text-slate-500 shrink-0">{k}</span>
                        <span className="font-mono text-indigo-700 text-right break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                  {deploy.explorerUrl && (
                    <a href={deploy.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="block text-center text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 py-2 rounded-lg transition-colors"
                      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      {deploy.status === "Deployed" ? "View on Casper Explorer →" : "View on Casper Explorer (pending) →"}
                    </a>
                  )}

                  {deploy.identityRegistry && (
                    <div className="space-y-2 rounded-lg p-3" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Identity Registry</div>
                      {([
                        ["Deploy Hash", deploy.identityRegistry.deployHash ?? deploy.identityRegistry.txHash ?? deploy.identityRegistry.registrationId ?? "—"],
                        ["Contract Hash", deploy.identityRegistry.contractHash ?? "—"],
                        ["Status", deploy.identityRegistry.status ?? "Pending Broadcast"],
                        ["Standard", deploy.identityRegistry.standard],
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4 text-[11px]">
                          <span className="text-slate-500 shrink-0">{k}</span>
                          <span className="font-mono text-emerald-700 text-right break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl p-5 space-y-2 mt-2" style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Coupon Servicing · Casper</div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Issuance metadata is now deployed through the Casper TokenCoupon WASM flow. Coupon distribution records can be added through the deployed Casper contract as the servicing module expands.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href="/portfolio"
                        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: "#059669", border: "1px solid #047857" }}>
                        分红派息
                      </Link>
                      <Link href="/portfolio"
                        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors hover:text-slate-900"
                        style={{ color: "#0f766e", background: "rgba(255,255,255,0.8)", border: "1px solid rgba(15,118,110,0.18)" }}>
                        查看派息记录
                      </Link>
                    </div>
                  </div>

                </div>
              )}

              {selected.status === "Pending SFC Review" && !deploy && (
                <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1.5">Awaiting SFC Review</div>
                  <p className="text-xs text-slate-600">This application has been submitted and is pending review by the SFC regulator. Casper registration will be available once authorisation is granted.</p>
                </div>
              )}
              {selected.status === "Changes Required" && !deploy && (
                <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-red-600 mb-1.5">Changes Required by SFC</div>
                  <p className="text-xs text-slate-600">The SFC regulator has requested amendments. Please review the notes above and resubmit via the compliance portal.</p>
                  <a href="/compliance" className="inline-block mt-2 text-[11px] font-semibold text-red-600 hover:underline">Go to Compliance Portal →</a>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
      )}
    </div>
  );
}