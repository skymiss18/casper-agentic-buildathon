"use client";
import { useState, useEffect } from "react";
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbiParameters } from "viem";
import { mantleSepoliaTestnet, mantle } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import artifact from "@/contracts/artifacts/contracts/HarbourRWAToken.sol/HarbourRWAToken.json";

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
  txHash: string;
  contractAddress: string;
  blockNumber: number;
  network: string;
  deployedAt: string;
  standard: string;
  gasUsed: number;
  explorerUrl: string;
}

const STATUS_CFG: Record<AppStatus, { color: string; bg: string; border: string; dot: string; label: string }> = {
  "Pending SFC Review": { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.3)",  dot: "bg-amber-400",   label: "Pending" },
  "Approved":           { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.3)",  dot: "bg-emerald-400", label: "Approved" },
  "Changes Required":   { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", dot: "bg-red-400",     label: "Changes" },
};

const DEMO_PRESETS = {
  HIBT: {
    assetName: "Harbour Infrastructure Bond Token (HIBT)",
    assetType: "Bond" as AssetType,
    description: "Tokenised corporate bond backed by Asia logistics infrastructure assets. 5-year tenor, 5.50% semi-annual coupon, SFC-authorised under SFO s.103. ERC-3643 on Mantle Network with AI compliance gating oracle.",
    unitPrice: "1000",
    totalSupply: "100000",
    prospectusText: `PROSPECTUS — HARBOUR INFRASTRUCTURE BOND TOKEN (HIBT)
SFC-Authorised Corporate Bond | Series 2026-B

ISSUER & ELIGIBILITY
Issuer: Harbour Capital Markets Corporation Limited
SFC Licence: Type 1 (Dealing in Securities) and Type 6 (Advising on Corporate Finance)
under the Securities and Futures Ordinance (SFO) Cap. 571.
Credit Rating: Moody's A2 / S&P A (Stable Outlook)

BOND TERMS & STRUCTURE
Token Standard:   ERC-3643 compliant token on Mantle Network
Token Symbol:     HIBT
Face Value:       USD 1,000 per token
Total Issuance:   USD 100,000,000 (100,000 tokens)
Coupon Rate:      5.50% per annum (semi-annual coupon payment)
Coupon Payment:   15 January and 15 July each year
Maturity Date:    15 July 2031 (5-year tenor)
Minimum Subscription: USD 20,000 (20 tokens)

INVESTOR ELIGIBILITY
This offering is exclusively available to Professional Investors (PI) and
institutional investors as defined under Schedule 1 of the Securities and
Futures Ordinance. Minimum net assets: USD 1,000,000.

CUSTODY & TRUSTEE ARRANGEMENTS
Trustee: HSBC Institutional Trust Services (Asia) Limited
Custodian: HashKey Custody (SFC-approved virtual asset custodian)

AML/KYC PROCEDURES
All investors are subject to full CDD under AMLO Cap. 615.
PEP screening via World-Check database.
AI-assisted identity verification with liveness check.
On-chain identity registry via ERC-3643 IdentityRegistry.sol.

SMART CONTRACT SECURITY
Smart contracts audited by PeckShield Inc. (Report ref: PS-2026-HIBT-001)
Zero critical or high-severity findings.

TRANSFER RESTRICTIONS
ERC-3643 compliance module enforces on-chain transfer restrictions.
Transfers blocked if recipient fails identity/jurisdiction check.`,
  },
  KCRT: {
    assetName: "Kowloon Commercial REIT Token (KCRT)",
    assetType: "REIT" as AssetType,
    description: "Fractionalised Asia Grade-A office REIT backed by rental income from the Kowloon East commercial corridor. Quarterly distributions, independent valuation, and ERC-3643 transfer restrictions on Mantle Network.",
    unitPrice: "1000",
    totalSupply: "120000",
    prospectusText: `PROSPECTUS — KOWLOON COMMERCIAL REIT TOKEN (KCRT)
SFC-Regulated Real Estate Investment Trust | Series 2026-R

ISSUER & MANAGER
Issuer: Asia Property Trust Management Ltd
SFC Licence: Type 9 (Asset Management)
Trustee: BOCI-Prudential Trustee Limited
External Valuer: Jones Lang LaSalle (JLL)

REIT ASSET PROFILE
Token Standard:   ERC-3643 compliant token on Mantle Network
Token Symbol:     KCRT
Underlying Assets: Grade-A commercial office portfolio in Kowloon East
Total Gross Asset Value: USD 154,000,000
Total Token Issuance: USD 15,400,000 (120,000 tokens)
Target Distribution Yield: 7.8% per annum, paid quarterly
Distribution Dates: 31 March, 30 June, 30 September, 31 December
Minimum Subscription: USD 65,000

INCOME & CUSTODY
Rental collections are swept into a regulated SPV collection account.
Net distributable income is calculated quarterly after management fees,
property tax, and maintenance reserves. Excess idle cash may be routed into
USDY pending the next distribution date.

INVESTOR ELIGIBILITY
This product is offered only to Professional Investors under Schedule 1 of the
Securities and Futures Ordinance. All investors must complete AMLO-compliant
KYC and hold tokens through whitelisted wallets.

RISK DISCLOSURE
Key risks include occupancy concentration, valuation volatility, secondary
market illiquidity, and manager conflict of interest. Quarterly property
occupancy and rent-roll reports are disclosed to token holders.

TRANSFER RESTRICTIONS
ERC-3643 transfer controls prohibit non-whitelisted holders and enforce
jurisdiction-specific transfer restrictions on-chain.`,
  },
} as const;

const TOKEN_DECIMALS = 10n ** 18n;
const DEFAULT_FACE_VALUE_USD = 1000n;
const DEMO_USD_PER_MNT = 1000n;

function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

export default function TokenizePage() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { data: wagmiWalletClient } = useWalletClient();

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
          issuer:         "Harbour Capital Markets Corporation Limited",
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
  const [records,     setRecords]     = useState<SFCRecord[]>([]);
  const [selected,    setSelected]    = useState<SFCRecord | null>(null);
  const [filter,      setFilter]      = useState<FilterType>("All");
  const [loading,     setLoading]     = useState(true);
  const [deploying,   setDeploying]   = useState(false);
  const [deployMap,   setDeployMap]   = useState<Record<string, DeployResult>>({});
  const [deployError, setDeployError] = useState<string | null>(null);

  // ── coupon distribution state ─────────────────────────────────────────────
  const [investorInput, setInvestorInput] = useState("");
  const [fundBusy,   setFundBusy]   = useState(false);
  const [fundResult, setFundResult] = useState<{ txHash: string; payout: string } | null>(null);
  const [fundError,  setFundError]  = useState<string | null>(null);

  function getCouponPaymentsPerYear(assetName: string) {
    return /reit|kcrt/i.test(assetName) ? 4n : 2n;
  }

  function getFaceValueUsd(assetName: string) {
    return /hibt|kcrt/i.test(assetName) ? DEFAULT_FACE_VALUE_USD : DEFAULT_FACE_VALUE_USD;
  }

  function getAssetTypeCode(assetName: string, assetType?: string) {
    if (assetType === "REIT" || /reit|kcrt/i.test(assetName)) return 0;
    if (assetType === "GreenBond" || /green/i.test(assetName)) return 1;
    if (assetType === "TradeReceivable" || /trade|receivable/i.test(assetName)) return 2;
    return 3;
  }

  function getDefaultCouponBps(assetName: string) {
    if (/kcrt/i.test(assetName)) return 780n;
    if (/hibt/i.test(assetName)) return 550n;
    return 550n;
  }

  function getDefaultMaturityDate(assetName: string) {
    if (/kcrt/i.test(assetName)) {
      return BigInt(Math.floor(new Date("2031-12-31T00:00:00Z").getTime() / 1000));
    }

    return BigInt(Math.floor(new Date("2031-07-15T00:00:00Z").getTime() / 1000));
  }

  function getDisplayCouponPerToken(assetName: string) {
    if (/hibt/i.test(assetName)) return "0.0275 MNT";
    if (/kcrt/i.test(assetName)) return "0.0195 MNT";
    return "Coupon-rate based";
  }

  async function handleFundCoupon() {
    if (!address) {
      openConnectModal?.();
      return;
    }

    const investorAddr = investorInput.trim() || (address ?? "");
    if (!investorAddr || !/^0x[0-9a-fA-F]{40}$/.test(investorAddr)) {
      setFundError("Enter a valid investor wallet address");
      return;
    }

    if (!selected?.asset?.trim()) {
      setFundError("Select an approved asset before paying coupon");
      return;
    }

    setFundBusy(true);
    setFundError(null);
    setFundResult(null);
    try {
      const rwaTokenAddress = process.env.NEXT_PUBLIC_HARBOUR_RWA_TOKEN_ADDRESS as `0x${string}` | undefined;
      if (!rwaTokenAddress || !/^0x[0-9a-fA-F]{40}$/.test(rwaTokenAddress) || rwaTokenAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("NEXT_PUBLIC_HARBOUR_RWA_TOKEN_ADDRESS not configured");
      }

      const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === "5000";
      const targetChainId = isMainnet ? 5000 : 5003;
      const targetChainDef = isMainnet ? mantle : mantleSepoliaTestnet;
      const rpcUrl = isMainnet
        ? (process.env.NEXT_PUBLIC_MANTLE_RPC ?? "https://rpc.mantle.xyz")
        : (process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC ?? "https://rpc.sepolia.mantle.xyz");

      await switchChainAsync({ chainId: targetChainId });

      if (!wagmiWalletClient) {
        throw new Error("No wallet connected — please connect your wallet first");
      }

      const publicClient = createPublicClient({
        chain: targetChainDef,
        transport: http(rpcUrl),
      });

      const couponBps = getDefaultCouponBps(selected.asset);

      const investorBalance = await publicClient.readContract({
        address: rwaTokenAddress,
        abi: artifact.abi,
        functionName: "balanceOf",
        args: [investorAddr as `0x${string}`],
      }) as bigint;

      if (investorBalance === 0n) {
        throw new Error("Investor holds no HIBT tokens");
      }

      const issuerNativeBalance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });

      const faceValueUsd = getFaceValueUsd(selected.asset);
      const couponPaymentsPerYear = getCouponPaymentsPerYear(selected.asset);
      const amountPerToken = (faceValueUsd * TOKEN_DECIMALS * couponBps) / 10000n / couponPaymentsPerYear / DEMO_USD_PER_MNT;
      const payout = (amountPerToken * investorBalance) / TOKEN_DECIMALS;

      if (payout === 0n) {
        throw new Error("Calculated payout is zero");
      }

      if (issuerNativeBalance <= payout) {
        throw new Error("Issuer wallet does not hold enough native MNT to pay this coupon and gas");
      }

      const txHash = await wagmiWalletClient.sendTransaction({
        to: investorAddr as `0x${string}`,
        value: payout,
        account: address,
        chain: targetChainDef,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

      setFundResult({ txHash, payout: (Number(payout) / 1e18).toFixed(4) });
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "Fund failed");
    } finally {
      setFundBusy(false);
    }
  }

  async function loadRecords() {
    setLoading(true);
    try {
      const [sfcRes, deplRes] = await Promise.all([
        fetch("/api/sfc-inbox"),
        fetch("/api/tokenize/deployments"),
      ]);
      const sfcData = await sfcRes.json();
      const deplData = await deplRes.json() as Record<string, DeployResult>;
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

  useEffect(() => {
    setFundBusy(false);
    setFundError(null);
    setFundResult(null);
  }, [selected?.id]);

  async function handleDeploy() {
    if (!selected || deploying) return;
    setDeployError(null);

    if (!address) {
      openConnectModal?.();
      return;
    }

    const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === "5000";
    const targetChainId = isMainnet ? 5000 : 5003;
    const targetChainDef = isMainnet ? mantle : mantleSepoliaTestnet;

    setDeploying(true);
    try {
      await switchChainAsync({ chainId: targetChainId });

      if (!wagmiWalletClient) throw new Error("No wallet connected — please connect your wallet first");
      const walletClient = wagmiWalletClient;
      const publicClient = createPublicClient({
        chain: targetChainDef,
        transport: http(isMainnet ? "https://rpc.mantle.xyz" : "https://rpc.sepolia.mantle.xyz"),
      });

      const rawName = selected.asset;
      const symbol = rawName.replace(/\s+/g, "").toUpperCase().slice(0, 6) || "HRWAT";
      const complianceModule = process.env.NEXT_PUBLIC_COMPLIANCE_MODULE_ADDRESS as `0x${string}`;
      const couponToken = process.env.NEXT_PUBLIC_USDY_ADDRESS as `0x${string}` | undefined;

      if (!couponToken) {
        throw new Error("NEXT_PUBLIC_USDY_ADDRESS not configured");
      }

      const txHash = await walletClient.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode as `0x${string}`,
        args: [rawName, symbol, address, complianceModule, couponToken],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

      const newEntry: DeployResult = {
        txHash,
        contractAddress: receipt.contractAddress ?? "",
        blockNumber: Number(receipt.blockNumber),
        network: isMainnet ? "Mantle" : "Mantle Sepolia",
        deployedAt: new Date().toISOString().slice(0, 10),
        standard: "ERC-3643",
        gasUsed: Number(receipt.gasUsed),
        explorerUrl: `${isMainnet ? "https://mantlescan.xyz" : "https://sepolia.mantlescan.xyz"}/tx/${txHash}`,
      };
      await fetch("/api/tokenize/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, deployment: newEntry }),
      });
      setDeployMap((prev) => ({ ...prev, [selected.id]: newEntry }));
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deployment failed, please retry");
    } finally {
      setDeploying(false);
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
                      placeholder="e.g. Harbour Infrastructure Bond Token (HIBT)"
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

          {/* ── Right: demo quick-fill + workflow ──────────────────────────── */}
          <div className="w-80 shrink-0 sticky top-6 space-y-4">

            {/* Demo data card */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)", background: "rgba(245,158,11,0.04)" }}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Sample Data</div>
                <p className="text-[11px] text-slate-500">Load a bond or REIT issuance track in one click</p>
              </div>
              <div className="px-4 py-3 space-y-3">
                {([
                  {
                    key: "HIBT",
                    title: "HIBT Bond",
                    facts: [["Supply", "100,000 tokens"], ["Coupon", "5.50% p.a."], ["Maturity", "15 Jul 2031"]],
                    button: "Load HIBT",
                  },
                  {
                    key: "KCRT",
                    title: "KCRT REIT",
                    facts: [["Supply", "120,000 tokens"], ["Yield", "7.8% p.a."], ["Distributions", "Quarterly"]],
                    button: "Load REIT",
                  },
                ] as const).map((demo) => (
                  <div key={demo.key} className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div className="text-[11px] font-semibold text-slate-700 mb-2">{demo.title}</div>
                    <div className="space-y-1.5 mb-3">
                      {demo.facts.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 text-[11px]">
                          <span className="text-slate-400 shrink-0">{k}</span>
                          <span className="font-medium text-slate-700 text-right">{v}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button"
                      onClick={() => setForm(DEMO_PRESETS[demo.key])}
                      className="w-full py-2 text-xs font-semibold rounded-lg transition-opacity hover:opacity-80"
                      style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", color: "#b45309" }}>
                      ✦ {demo.button}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Issuance workflow */}
            <div className="rounded-xl p-4" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Issuance Workflow</div>
              <ol className="space-y-3">
                {([
                  ["1", "#1d4ed8", "Submit for Review",      "You are here — fill in asset details and submit to intermediary Sponsor Inbox."],
                  ["2", "#6366f1", "AI Compliance Check",    "Type 6 LC runs SFC compliance review at /compliance and files with the regulator."],
                  ["3", "#7c3aed", "SFC Approval",           "SFC reviews the application at /regulator/issuance and grants authorisation."],
                  ["4", "#059669", "Deploy on Mantle",       "Return to Step 2 tab — deploy the ERC-3643 token once SFC-approved."],
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
              { n: "4", label: "On-Chain Deployment",   sub: "Deploy token on Mantle Network",         color: "#10b981", bg: "rgba(16,185,129,0.10)" },
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
                  <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600 mb-1">SFC On-Chain Approval Record</div>
                  <div className="font-mono text-[11px] text-violet-700 break-all">{selected.approvedTx}</div>
                  <a href={`https://sepolia.mantlescan.xyz/tx/${selected.approvedTx}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-violet-500 hover:underline mt-0.5 inline-block">
                    View on Mantle Explorer →
                  </a>
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
                  <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-2">Deploy ERC-3643 Token · Mantle Network</div>
                  <p className="text-xs text-slate-600 mb-4">SFC authorisation confirmed. Deploy <strong>HarbourRWAToken.sol</strong> on Mantle Sepolia, pre-configured with the SFC reference, compliance oracle, and on-chain transfer restrictions.</p>

                  {/* Wallet status row */}
                  {address ? (
                    <div className="flex items-center gap-2 mb-3 text-[10px]" style={{ color: "#10b981" }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>
                      <span className="text-slate-400">Connected · will deploy as</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-3 text-[10px] text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      <span>Wallet not connected — click to connect first</span>
                    </div>
                  )}

                  {deployError && (
                    <div className="text-[11px] text-red-600 rounded-lg px-3 py-2 mb-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {deployError}
                    </div>
                  )}

                  <button onClick={handleDeploy} disabled={deploying}
                    className="w-full py-3 text-sm font-bold text-white rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
                    {deploying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Awaiting wallet signature...
                      </>
                    ) : !address ? "🔗  Connect Wallet & Deploy →" : "🚀  Deploy Now →"}
                  </button>
                </div>
              )}

              {/* Deploy result */}
              {deploy && (
                <div className="rounded-xl p-5 space-y-4" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">✅</span>
                    <div>
                      <div className="text-sm font-bold text-indigo-700">Token Deployed Successfully</div>
                      <div className="text-[10px] text-slate-500">{deploy.network} · {deploy.standard} · {deploy.deployedAt}</div>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(99,102,241,0.15)" }}>
                    {([
                      ["Transaction Hash",  deploy.txHash],
                      ["Contract Address",  deploy.contractAddress],
                      ["Block Number",      String(deploy.blockNumber)],
                      ["Gas Used",          deploy.gasUsed.toLocaleString()],
                      ["Standard",          deploy.standard],
                      ["Network",           deploy.network],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 text-[11px]">
                        <span className="text-slate-500 shrink-0">{k}</span>
                        <span className="font-mono text-indigo-700 text-right break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                  <a href={deploy.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 py-2 rounded-lg transition-colors"
                    style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    View on Mantle Explorer →
                  </a>

                  {/* ── Coupon Payment ───────────────────────────────────────── */}
                  <div className="rounded-xl p-5 space-y-4 mt-2" style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Pay Coupon · HIBT</div>
                    {/* Schedule table */}
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                          <th className="text-left pb-1 text-slate-400 font-medium">Payment Date</th>
                          <th className="text-right pb-1 text-slate-400 font-medium">Per Token</th>
                          <th className="text-right pb-1 text-slate-400 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                          <td className="py-1.5 text-slate-700">15 Jan 2026</td>
                          <td className="py-1.5 text-right font-mono text-slate-700">{getDisplayCouponPerToken(selected.asset)} </td>
                          <td className="py-1.5 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>Paid</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 text-slate-700">15 Jul 2026</td>
                          <td className="py-1.5 text-right font-mono text-slate-700">{getDisplayCouponPerToken(selected.asset)} </td>
                          <td className="py-1.5 text-right">
                            {fundResult
                              ? <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>Paid</span>
                              : <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}>Pending</span>
                            }
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {!fundResult && (
                      <div className="space-y-2">
                        <label className="text-[10px] text-slate-500 font-medium">Investor Wallet Address</label>
                        <input
                          type="text"
                          value={investorInput}
                          onChange={(e) => setInvestorInput(e.target.value)}
                          placeholder={address ? `${address} (connected wallet)` : "0x..."}
                          className="w-full text-[11px] font-mono rounded-lg px-3 py-2 outline-none"
                          style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.15)", color: "#334155" }}
                        />
                        {fundError && (
                          <div className="text-[11px] text-red-600 rounded px-3 py-2" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            {fundError}
                          </div>
                        )}
                        <button
                          onClick={handleFundCoupon}
                          disabled={fundBusy}
                          className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                          style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                        >
                          {fundBusy ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Distributing...</>
                          ) : "💸  Pay Jul 2026 Coupon →"}
                        </button>
                      </div>
                    )}

                    {fundResult && (
                      <div className="rounded-lg px-4 py-3 space-y-1" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                        <div className="text-[11px] font-bold text-emerald-700">✅ Coupon Paid</div>
                        <div className="text-[11px] text-slate-600">{fundResult.payout} MNT sent from issuer wallet to investor wallet</div>
                        <a href={`https://sepolia.mantlescan.xyz/tx/${fundResult.txHash}`} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-mono text-emerald-700 hover:underline break-all">
                          Tx: {fundResult.txHash.slice(0, 20)}...
                        </a>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {selected.status === "Pending SFC Review" && !deploy && (
                <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1.5">Awaiting SFC Review</div>
                  <p className="text-xs text-slate-600">This application has been submitted and is pending review by the SFC regulator. Deployment will be available once authorisation is granted.</p>
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