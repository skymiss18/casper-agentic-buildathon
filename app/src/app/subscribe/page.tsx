"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";
import { useWalletClient } from "wagmi";

// ── Constants ──────────────────────────────────────────────────────────────────

const COUPON_RATE      = 0.055;
const SUBSCRIPTION_FEE = 0.0025;   // 0.25%
const ANNUAL_MGMT_FEE  = 0.0008;   // 0.08%
const CUSTODY_FEE      = 0.0005;   // 0.05%
const MIN_TOKENS       = 20;
const DEADLINE         = "30 June 2026, 17:00 HKT";
const SETTLEMENT       = "15 July 2026";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ["Pre-check", "Subscription", "Declarations", "Payment"];

type ApprovedAsset = {
  id: string;
  asset: string;
  type: string;
  status: "Pending SFC Review" | "Approved" | "Changes Required";
  unitPrice?: string;
};

type SponsorAsset = {
  assetName: string;
  unitPrice?: string;
};

type AssetOption = {
  name: string;
  unitPrice: number;
};

function buildRefPrefix(assetName: string) {
  const cleaned = assetName.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (cleaned.slice(0, 4) || "RWA") + "-";
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SubscribePage() {
  const { wallet: connectedWallet } = useWallet();
  const { data: walletClient } = useWalletClient();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [kycConfirmed,    setKycConfirmed]    = useState(false);
  const [piConfirmed,     setPiConfirmed]     = useState(false);
  const [notUSPerson,     setNotUSPerson]     = useState(false);

  // Step 2
  const [assetName,       setAssetName]       = useState("Harbour Infrastructure Bond Token (HIBT)");
  const [approvedAssets,  setApprovedAssets]  = useState<AssetOption[]>([{ name: "Harbour Infrastructure Bond Token (HIBT)", unitPrice: 1000 }]);
  const [assetsLoading,   setAssetsLoading]   = useState(true);
  const [assetsError,     setAssetsError]     = useState<string | null>(null);
  const [tokens,          setTokens]          = useState("200");

  // Step 3
  const [declProspectus,  setDeclProspectus]  = useState(false);
  const [declConflict,    setDeclConflict]    = useState(false);
  const [declRisk,        setDeclRisk]        = useState(false);
  const [declPiStatus,    setDeclPiStatus]    = useState(false);

  // Step 1 ...wallet
  const [walletAddress, setWalletAddress] = useState("");
  useEffect(() => {
    if (connectedWallet) {
      setWalletAddress(connectedWallet);
      return;
    }
    // Fallback: read already-connected accounts without triggering a popup
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (eth) {
      eth.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) setWalletAddress(accounts[0]);
      }).catch(() => {});
    }
  }, [connectedWallet]);

  // Step 4
  const [refNum, setRefNum] = useState(() => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-8);
    return "HIBT-" + suffix;
  });
  const [submitted,     setSubmitted]     = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);
  const [txHash,        setTxHash]        = useState<string | null>(null);
  const [onChain,       setOnChain]       = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"swift" | "onchain">("onchain");
  const [paying,        setPaying]        = useState(false);
  const [payError,      setPayError]      = useState<string | null>(null);
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);

  const TREASURY   = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "";

  const assetCode = buildRefPrefix(assetName).replace("-", "");
  const selectedAsset = approvedAssets.find((asset) => asset.name === assetName) ?? approvedAssets[0] ?? { name: assetName, unitPrice: 1000 };
  const faceValue = selectedAsset.unitPrice;

  useEffect(() => {
    let active = true;
    async function loadApprovedAssets() {
      try {
        setAssetsLoading(true);
        setAssetsError(null);
        const [sfcRes, sponsorRes] = await Promise.all([
          fetch("/api/sfc-inbox"),
          fetch("/api/sponsor-inbox"),
        ]);
        const sfcData = await sfcRes.json() as { submissions?: ApprovedAsset[] };
        const sponsorData = await sponsorRes.json() as { submissions?: SponsorAsset[] };

        const sponsorPriceMap = new Map(
          (sponsorData.submissions ?? []).map((entry) => [entry.assetName, Number(entry.unitPrice ?? "0")])
        );

        const uniqueMap = new Map<string, AssetOption>();
        for (const submission of sfcData.submissions ?? []) {
          if (submission.status !== "Approved" || !submission.asset?.trim()) continue;
          const unitPrice = Number(submission.unitPrice ?? sponsorPriceMap.get(submission.asset) ?? 0);
          if (unitPrice <= 0) continue;
          if (!uniqueMap.has(submission.asset)) {
            uniqueMap.set(submission.asset, { name: submission.asset, unitPrice });
          }
        }

        const finalList = uniqueMap.size > 0
          ? Array.from(uniqueMap.values())
          : [{ name: "Harbour Infrastructure Bond Token (HIBT)", unitPrice: 1000 }];
        if (!active) return;
        setApprovedAssets(finalList);
        if (!finalList.some((asset) => asset.name === assetName)) {
          setAssetName(finalList[0].name);
        }
      } catch {
        if (!active) return;
        setAssetsError("Failed to load approved assets");
        setApprovedAssets([{ name: "Harbour Infrastructure Bond Token (HIBT)", unitPrice: 1000 }]);
      } finally {
        if (active) setAssetsLoading(false);
      }
    }

    void loadApprovedAssets();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-8);
    setRefNum(buildRefPrefix(assetName) + suffix);
  }, [assetName]);

  const effectiveWalletAddress = connectedWallet || walletAddress;
  const effectiveKycConfirmed  = kycConfirmed || !!connectedWallet;

  const tokenCount   = parseInt(tokens) || 0;
  const principal    = tokenCount * faceValue;
  const subFee       = principal * SUBSCRIPTION_FEE;
  const annualMgmt   = principal * ANNUAL_MGMT_FEE;
  const custodyAnn   = principal * CUSTODY_FEE;
  const totalDue     = principal + subFee;
  // Demo rate: 1 MNT = USD 1,000 (testnet demo only; real USD value shown separately)
  const mntAmount    = totalDue / 1000;
  const semiCoupon   = tokenCount * faceValue * COUPON_RATE / 2;

  const hkdRate      = 7.8;
  const displayAmt   = (n: number) =>
    "USD " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  function step1Valid() { return effectiveKycConfirmed && piConfirmed && notUSPerson && /^0x[0-9a-fA-F]{40}$/.test(effectiveWalletAddress); }

  async function handleConfirmSubscription(pmtTxHash?: string) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: effectiveWalletAddress, tokenCount, assetName, refNum, paymentTxHash: pmtTxHash ?? paymentTxHash }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? data.message ?? "Submission failed");
        return;
      }
      setTxHash(data.txHash ?? null);
      setOnChain(!!data.onChain);
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOnChainPayment() {
    setPaying(true);
    setPayError(null);
    try {
      if (!walletClient) throw new Error("No wallet connected. Please connect your wallet.");
      if (!TREASURY) throw new Error("Treasury address not configured.");
      const weiAmt = BigInt(Math.round(mntAmount * 1e18));
      const pmtHash = await walletClient.sendTransaction({
        to:    TREASURY as `0x${string}`,
        value: weiAmt,
      });
      // MetaMask confirmed — show success immediately; record in background
      setPaying(false);
      setPaymentTxHash(pmtHash);
      setSubmitted(true);
      // Fire-and-forget: record subscription and attempt on-chain mint
      void handleConfirmSubscription(pmtHash);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Payment failed");
      setPaying(false);
    }
  }
  function step2Valid() { return tokenCount >= MIN_TOKENS && tokenCount <= 100_000; }
  function step3Valid() { return declProspectus && declConflict && declRisk && declPiStatus; }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Page header */}
      <div className="mb-8 pb-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.10)" }}>
        <h1 className="text-2xl font-bold text-gray-900">{assetCode} Subscription Order</h1>
        <p className="text-sm text-slate-600 mt-1.5 max-w-xl">
          {assetName} &middot; Series 2026-B &middot;
          <span className="text-amber-600 ml-1.5">Deadline: {DEADLINE}</span>
        </p>
      </div>

      {/* Deadline banner */}
      <div className="rounded px-4 py-3 mb-7 flex flex-wrap items-center gap-4 text-xs"
        style={{ background: "rgba(254,243,199,0.8)", border: "1px solid rgba(217,119,6,0.3)" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        <span className="text-amber-700 font-semibold">Subscription closes 30 Jun 2026 17:00 HKT</span>
        <span className="text-slate-500">Settlement: {SETTLEMENT} &middot; T+2 on-chain atomic settlement</span>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-0 mb-2">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step;
          const done   = submitted ? true : step > n;
          const active = !submitted && step === n;
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
                  style={{ color: active ? "#1d4ed8" : done ? "#16a34a" : "#888888" }}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 h-px mx-1 mb-4 transition-colors"
                  style={{ background: step > n || submitted ? "#16a34a" : "rgba(0,0,0,0.12)" }} />
              )}
            </div>
          );
        })}
      </div>
      {!submitted && (
        <p className="text-[10px] text-slate-600 text-right mb-6">
          Step {step} of {STEP_LABELS.length}
        </p>
      )}

      {/* ── STEP 1: Pre-check ─────────────────────────────────────────────────── */}
      {step === 1 && !submitted && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-slate-900">Eligibility Pre-check</h2>
          <p className="text-xs text-slate-500 -mt-2 leading-relaxed">
            All three conditions must be satisfied before proceeding with subscription.
          </p>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={effectiveKycConfirmed} onChange={(e) => setKycConfirmed(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div>
                <div className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                  KYC Approved
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  I confirm my wallet has been successfully KYC-verified and approved by HarbourRWA.
                  My compliance score is ...70/100.{" "}
                  <Link href="/kyc" className="text-blue-400 hover:underline">Complete KYC first &rarr;</Link>
                  <div className="mt-2">
                    <>
                        {connectedWallet ? (
                          <>
                            <input
                              type="text" readOnly
                              value={walletAddress}
                              className="w-full text-xs rounded px-2.5 py-1.5 font-mono outline-none mt-1"
                              style={{ background: "rgba(22,163,74,0.07)", border: "1px solid #16a34a", color: "#15803d" }}
                            />
                            <p className="text-[10px] text-emerald-600 mt-0.5">Auto-filled from connected wallet</p>
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-500 mt-1">
                            Please connect your wallet first to continue.
                          </p>
                        )}
                      </>
                  </div>
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={piConfirmed} onChange={(e) => setPiConfirmed(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div>
                <div className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                  Professional Investor Status
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  I am a Professional Investor as defined under Schedule 1 of the Securities and Futures
                  Ordinance (SFO). Individual PI: net assets &ge; USD 1,000,000. Institutional PI:
                  SFC-licensed firm, insurer, bank, or MPF trustee.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={notUSPerson} onChange={(e) => setNotUSPerson(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div>
                <div className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                  Non-US Person Declaration
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  I am not a US Person as defined under Regulation S of the US Securities Act 1933.
                  Distribution to US persons is restricted.
                </div>
              </div>
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button onClick={() => setStep(2)} disabled={!step1Valid()}
              className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Subscription Details ──────────────────────────────────────── */}
      {step === 2 && !submitted && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-slate-900">Subscription Details</h2>

          {/* Asset selector */}
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">
              Asset to Subscribe <span className="text-red-400">*</span>
            </label>
            <select
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              disabled={assetsLoading}
              className="w-full text-sm rounded px-3 py-2.5 text-slate-900 outline-none transition-colors"
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
            >
              {approvedAssets.map((asset) => (
                <option key={asset.name} value={asset.name}>{asset.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-600 mt-1.5">
              {assetsLoading
                ? "Loading SFC-approved assets..."
                : `You can reuse one KYC approval to subscribe multiple approved assets (${approvedAssets.length} available). Unit price comes from issuer config on /tokenize.`}
            </p>
            {assetsError && (
              <p className="text-[11px] text-red-500 mt-1">{assetsError}</p>
            )}
          </div>

          {/* Token input */}
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">
              Number of {assetCode} Tokens <span className="text-red-400">*</span>
            </label>
            <p className="text-[11px] text-slate-600 mb-2">
              Minimum 20 tokens (USD {(20 * faceValue).toLocaleString("en-US")}) &middot; Unit price USD {faceValue.toLocaleString("en-US")} per token &middot; Max 100,000 tokens
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number" min="20" max="100000" step="1"
                className="w-48 text-sm rounded px-3 py-2.5 text-slate-900 outline-none transition-colors font-mono"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}
                value={tokens}
                onChange={(e) => setTokens(e.target.value)}
                onFocus={(e)  => (e.currentTarget.style.borderColor = "#1a56db")}
                onBlur={(e)   => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
              />
              <span className="text-xs text-slate-500">{assetCode} tokens</span>
            </div>
            {tokenCount > 0 && tokenCount < MIN_TOKENS && (
              <p className="text-[11px] text-red-400 mt-1.5">Minimum subscription is 20 tokens</p>
            )}
          </div>

          {/* Fee breakdown */}
          {tokenCount >= MIN_TOKENS && (
            <div className="rounded p-4 space-y-2.5"
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
              <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-3">
                Subscription Fee Breakdown
              </div>
              {[
                ["Principal",         displayAmt(principal),   ""],
                ["Subscription fee",  displayAmt(subFee),      "0.25% of principal"],
                ["Total payable",     displayAmt(totalDue),    "Due by 30 Jun 2026"],
              ].map(([k, v, note]) => (
                <div key={k} className="flex items-baseline justify-between text-xs">
                  <span className="text-slate-500">{k}{note && <span className="text-slate-700 ml-1.5">({note})</span>}</span>
                  <span className={`font-mono font-semibold ${k === "Total payable" ? "text-slate-900" : "text-slate-600"}`}>{v}</span>
                </div>
              ))}
              <div className="h-px my-1" style={{ background: "rgba(0,0,0,0.12)" }} />
              <div className="text-[10px] text-slate-600 space-y-1 pt-1">
                <div className="flex justify-between">
                  <span>Annual management fee (ongoing)</span>
                  <span className="font-mono">{displayAmt(annualMgmt)} p.a.</span>
                </div>
                <div className="flex justify-between">
                  <span>Custody fee (ongoing)</span>
                  <span className="font-mono">{displayAmt(custodyAnn)} p.a.</span>
                </div>
                <div className="flex justify-between pt-1 border-t" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
                  <span className="text-slate-500">Semi-annual coupon income</span>
                  <span className="font-mono text-emerald-500">{displayAmt(semiCoupon)} per payment</span>
                </div>
              </div>
            </div>
          )}

          {/* Bond summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            {[
              { label: "Coupon Rate", value: "5.50% p.a." },
              { label: "Maturity",    value: "15 Jul 2031" },
              { label: "Rating",      value: "Moody's A2 / S&P A" },
              { label: "Settlement",  value: "T+2 on-chain" },
            ].map((m) => (
              <div key={m.label} className="rounded p-2.5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                <div className="text-slate-600 text-[10px]">{m.label}</div>
                <div className="text-slate-700 font-medium mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button onClick={() => setStep(1)}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-600 transition-colors hover:text-slate-900"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Back
            </button>
            <button onClick={() => setStep(3)} disabled={!step2Valid()}
              className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Declarations ──────────────────────────────────────────────── */}
      {step === 3 && !submitted && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-slate-900">Required Declarations</h2>
          <p className="text-xs text-slate-500 -mt-2">
            All declarations must be confirmed before you can place the order.
          </p>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={declProspectus} onChange={(e) => setDeclProspectus(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <span className="text-slate-900 font-medium">Prospectus Receipt Confirmation: </span>
                I confirm I have received, read, and understood the HIBT Prospectus (SFC/HIBT/2026-B/001),
                including all risk factors, fee structures, and redemption terms. I acknowledge the document
                is committed to EigenDA with on-chain hash in the token contract.
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={declConflict} onChange={(e) => setDeclConflict(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <span className="text-slate-900 font-medium">Conflict of Interest Acknowledgement: </span>
                I acknowledge that Harbour Capital Markets Corporation Limited acts as both issuer and
                placement agent for this offering. This conflict has been disclosed in the prospectus
                per SFC Code of Conduct para. 13.5, and I proceed on an informed basis.
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={declRisk} onChange={(e) => setDeclRisk(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <span className="text-slate-900 font-medium">Risk Acknowledgement: </span>
                I understand the material risk factors including credit risk, interest rate risk,
                liquidity risk (no guaranteed secondary market), technology risk (smart contract
                vulnerabilities), and regulatory risk. Investment may result in loss of capital.
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={declPiStatus} onChange={(e) => setDeclPiStatus(e.target.checked)}
                className="mt-0.5 shrink-0 accent-blue-500" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <span className="text-slate-900 font-medium">PI Status Declaration: </span>
                I declare that I am subscribing as a Professional Investor under Schedule 1 of the SFO
                and waive certain protections under the SFC Code of Conduct that are not applicable
                to PI dealings. I understand this product is not available to retail investors.
              </div>
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button onClick={() => setStep(2)}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-600 transition-colors hover:text-slate-900"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Back
            </button>
            <button onClick={() => setStep(4)} disabled={!step3Valid()}
              className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              Proceed to Payment &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Payment Instructions ──────────────────────────────────────── */}
      {step === 4 && !submitted && (
        <div className="rounded p-6 space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <h2 className="text-base font-semibold text-slate-900">Payment Instructions</h2>

          {/* Amount due */}
          <div className="rounded p-4 flex items-center justify-between"
            style={{ background: "#ffffff", border: "1px solid #1a56db" }}>
            <div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Total Amount Due</div>
              <div className="text-2xl font-bold text-slate-900 font-mono">{displayAmt(totalDue)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {tokenCount} tokens x USD {faceValue.toLocaleString("en-US")} + 0.25% subscription fee
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-600 mb-1">Reference</div>
              <code className="text-blue-400 font-mono text-sm">{refNum}</code>
            </div>
          </div>

          {/* Payment method toggle */}
          <div className="flex rounded overflow-hidden text-xs font-medium"
            style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
            <button
              type="button"
              onClick={() => setPaymentMethod("onchain")}
              className="flex-1 py-2.5 transition-colors"
              style={{
                background: paymentMethod === "onchain" ? "#1d4ed8" : "#ffffff",
                color: paymentMethod === "onchain" ? "#ffffff" : "#64748b",
              }}>
              On-chain (MNT via wallet)
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("swift")}
              className="flex-1 py-2.5 transition-colors"
              style={{
                background: paymentMethod === "swift" ? "#1d4ed8" : "#ffffff",
                color: paymentMethod === "swift" ? "#ffffff" : "#64748b",
                borderLeft: "1px solid rgba(0,0,0,0.10)",
              }}>
              SWIFT Wire Transfer
            </button>
          </div>

          {/* ── SWIFT details ── */}
          {paymentMethod === "swift" && (
            <>
              <p className="text-xs text-slate-500 -mt-2">
                Wire the subscription amount to the escrow account below. Tokens will be delivered T+2 after funds are confirmed.
              </p>
              <div className="rounded p-4 space-y-2.5 text-xs"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-3">SWIFT Wire Transfer Details</div>
                {[
                  ["Beneficiary",       "Harbour Capital Markets Corporation Limited"],
                  ["Account No.",       "001-234567-001 (USD)"],
                  ["Bank",              "HSBC"],
                  ["SWIFT / BIC",       "HSBCHKHHHKH"],
                  ["Bank Address",      "1 Queen's Road Central"],
                  ["Payment Reference", refNum + " / HIBT Subscription"],
                  ["Payment Deadline",  "30 June 2026, 17:00 HKT"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <span className="text-slate-600 w-40 shrink-0">{k}</span>
                    <span className={`text-slate-700 ${k === "Payment Reference" ? "font-mono text-blue-600 font-semibold" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="rounded p-3 text-xs text-amber-700 leading-relaxed"
                style={{ background: "rgba(254,243,199,0.8)", border: "1px solid rgba(217,119,6,0.3)" }}>
                Include your reference number <code className="text-amber-700 font-mono">{refNum}</code> in the
                payment remarks. Funds must clear by 30 June 2026 17:00 HKT.
              </div>
            </>
          )}

          {/* ── On-chain MNT payment ── */}
          {paymentMethod === "onchain" && (
            <>
              <p className="text-xs text-slate-500 -mt-2">
                Send MNT directly from your connected wallet. {assetCode} tokens will be minted to your wallet atomically after on-chain payment is confirmed.
              </p>
              <div className="rounded p-4 space-y-3 text-xs"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
                <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-1">On-chain Payment Details</div>
                {[
                  ["Network",           "Mantle Sepolia Testnet (Chain ID: 5003)"],
                  ["Payment Token",     "Native MNT"],
                  ["Amount (testnet)",     mntAmount.toFixed(4) + " MNT"],
                  ["Real USD Value",    displayAmt(totalDue)],
                  ["Recipient",         TREASURY],
                  ["Settlement",        `Atomic — ${assetCode} minted in same block after payment`],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <span className="text-slate-600 w-40 shrink-0">{k}</span>
                    <span className={`font-mono text-slate-700 break-all ${k === "Recipient" ? "text-[10px]" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
              {paymentTxHash && (
                <div className="rounded px-3 py-2 text-xs text-emerald-700 flex items-center gap-2"
                  style={{ background: "rgba(22,163,74,0.07)", border: "1px solid #16a34a" }}>
                  <span>&#10003;</span>
                  <span>Payment sent: <a href={`https://sepolia.mantlescan.xyz/tx/${paymentTxHash}`} target="_blank" rel="noopener noreferrer" className="underline font-mono">{paymentTxHash.slice(0, 20)}…</a></span>
                </div>
              )}
              {payError && (
                <div className="rounded px-3 py-2 text-xs text-red-600"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {payError}
                </div>
              )}
            </>
          )}

          <div className="pt-2 flex items-center justify-between">
            <button onClick={() => setStep(3)}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-600 transition-colors hover:text-slate-900"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Back
            </button>
            {submitError && (
              <div className="rounded px-3 py-2 text-xs text-red-600" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {submitError}
              </div>
            )}
            {paymentMethod === "swift" ? (
              <button
                onClick={() => handleConfirmSubscription()}
                disabled={submitting}
                className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#1d4ed8" }}>
                {submitting ? "Submitting to Mantle..." : "Confirm Subscription Order"}
              </button>
            ) : (
              <button
                onClick={handleOnChainPayment}
                disabled={paying || submitting || !!paymentTxHash}
                className="px-6 py-2.5 text-sm font-semibold rounded text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#059669" }}>
                {paying ? "Waiting for wallet..." : submitting ? `Minting ${assetCode}...` : paymentTxHash ? "Payment Sent \u2713" : `Pay ${mntAmount.toFixed(4)} MNT via wallet`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CONFIRMATION ──────────────────────────────────────────────────────── */}
      {submitted && (
        <div className="rounded p-8 text-center space-y-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: "rgba(22,163,74,0.07)", border: "1px solid #16a34a" }}>
            <span className="text-emerald-400 text-2xl font-bold">&#10003;</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Subscription Order Confirmed</h2>
          <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
            Your order for <span className="text-slate-900 font-semibold">{tokenCount} {assetCode} tokens</span> ({displayAmt(principal)}) has been recorded.
            {paymentMethod === "onchain"
              ? " Your on-chain payment has been confirmed and tokens have been minted to your wallet."
              : " Wire the subscription funds using the payment reference below to complete settlement."}
          </p>

          <div className="inline-flex items-center gap-3 rounded px-5 py-3"
            style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <span className="text-slate-500 text-xs">Payment Reference</span>
            <code className="font-mono text-blue-400 text-base font-semibold">{refNum}</code>
          </div>

          <div className="rounded p-4 text-left text-xs space-y-2"
            style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-3">Settlement Timeline</div>
            {[
              ["Wire Transfer",     "Send " + displayAmt(totalDue) + " to HSBC escrow with reference " + refNum],
              ["Funds Reconciled",  "Harbour Capital matches your incoming payment to the reference within 1 business day"],
              ["Token Issuance",    onChain
                ? `Minted on-chain. Mint TxHash: ${txHash?.slice(0, 18)}…`
                : paymentTxHash
                  ? `Payment TxHash: ${paymentTxHash.slice(0, 18)}… | Mint TxHash: ${txHash?.slice(0, 18) ?? "pending"}…`
                  : "HarbourRWA's compliance system verifies settlement conditions, then issues tokens to your wallet"],
              ["Token Delivery",    `${assetCode} tokens delivered to your whitelisted wallet on ${SETTLEMENT} (2 business days after confirmed payment)`],
              ["First Coupon",      "USD " + semiCoupon.toFixed(2) + " per semi-annual coupon from 15 Jan 2027"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-emerald-400 shrink-0">+</span>
                <div>
                  <span className="text-slate-700 font-medium">{k}: </span>
                  <span className="text-slate-500">{v}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-600 transition-colors hover:text-slate-900"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}
            >
              Save as PDF
            </button>
            <a href={"mailto:institutional@harbourcapital.hk?subject=" + encodeURIComponent(`${assetCode} Subscription ${refNum}`)}
              className="px-5 py-2.5 text-sm font-medium rounded text-slate-600 transition-colors hover:text-slate-900"
              style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              Email Placement Agent
            </a>
            <Link href="/portfolio"
              className="px-5 py-2.5 text-sm font-semibold rounded text-white transition-opacity hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              Back to Portfolio
            </Link>
          </div>

          <p className="text-[10px] text-slate-700 pt-2">
            SFC Authorisation Ref: SFC/HIBT/2026-B/001 &middot; Subscription Deadline: 30 Jun 2026 17:00 HKT
            &middot; Governing Law: SFC
          </p>
        </div>
      )}

    </div>
  );
}
