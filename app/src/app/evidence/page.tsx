import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type DeploymentRecord = {
  deployHash?: string;
  txHash?: string;
  assetName?: string;
  contractHash?: string;
  explorerUrl?: string;
  status?: string;
  network?: string;
};

type KycRecord = {
  id: string;
  fullName?: string;
  walletAddress?: string;
  status?: string;
  aiScore?: number | null;
  riskBand?: number | null;
  monitoringStatus?: string | null;
  credentialCommitment?: string | null;
  nullifierHash?: string | null;
  proofHash?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
  lastScreenedAt?: string | null;
  agentReason?: string | null;
};

type SubscriptionRecord = {
  assetName?: string;
  investorPublicKey?: string;
  mintStatus?: string;
  paymentTxHash?: string;
  mintTxHash?: string;
  createdAt?: string;
};

function readJson<T>(fileName: string, fallback: T): T {
  try {
    const filePath = path.join(process.cwd(), "data", fileName);
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function shortHash(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function explorerForDeploy(hash: string | null | undefined) {
  if (!hash) return null;
  return `https://testnet.cspr.live/deploy/${hash}`;
}

export default async function EvidencePage() {
  const deployments = readJson<Record<string, DeploymentRecord>>("deployments.json", {});
  const kycApps = readJson<KycRecord[]>("kyc-inbox.json", []);
  const subscriptions = readJson<SubscriptionRecord[]>("subscriptions.json", []);

  const deploymentRows = Object.entries(deployments)
    .map(([id, record]) => ({ id, ...record }))
    .filter((record) => (record.network ?? "").toLowerCase().includes("casper"))
    .slice(0, 8);

  const latestKyc = [...kycApps]
    .sort((a, b) => {
      const left = Date.parse(a.lastScreenedAt ?? "") || 0;
      const right = Date.parse(b.lastScreenedAt ?? "") || 0;
      return right - left;
    })
    .slice(0, 8);

  const latestSubs = [...subscriptions]
    .sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0))
    .slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
        <h1 className="text-2xl font-semibold text-slate-900">Judge Evidence Center</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-3xl">
          This page aggregates live Casper-oriented evidence across deployment, privacy-preserving KYC credential lifecycle,
          and subscription execution outcomes. Sensitive user documents remain off-chain.
        </p>
      </div>

      <section className="rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">Casper Deployments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <th className="text-left py-2 pr-3">ID</th>
                <th className="text-left py-2 pr-3">Asset</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Contract</th>
                <th className="text-left py-2 pr-3">Deploy</th>
              </tr>
            </thead>
            <tbody>
              {deploymentRows.map((row) => {
                const hash = row.deployHash ?? row.txHash ?? "";
                const explorer = row.explorerUrl ?? explorerForDeploy(hash);
                return (
                  <tr key={row.id} className="border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                    <td className="py-2 pr-3 font-mono text-blue-700">{row.id}</td>
                    <td className="py-2 pr-3 text-slate-700">{row.assetName ?? "-"}</td>
                    <td className="py-2 pr-3 text-slate-700">{row.status ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-slate-700">{shortHash(row.contractHash)}</td>
                    <td className="py-2 pr-3">
                      {explorer ? (
                        <a className="text-blue-600 hover:underline" href={explorer} target="_blank" rel="noreferrer">
                          {shortHash(hash)}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">KYC Credential Lifecycle (Privacy Preserving)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <th className="text-left py-2 pr-3">Application</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Risk</th>
                <th className="text-left py-2 pr-3">Commitment</th>
                <th className="text-left py-2 pr-3">Proof</th>
                <th className="text-left py-2 pr-3">Chain Tx</th>
              </tr>
            </thead>
            <tbody>
              {latestKyc.map((row) => (
                <tr key={row.id} className="border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  <td className="py-2 pr-3">
                    <div className="font-mono text-blue-700">{row.id}</div>
                    <div className="text-slate-500">{row.fullName ?? "-"}</div>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{row.monitoringStatus ?? row.status ?? "-"}</td>
                  <td className="py-2 pr-3 text-slate-700">{row.riskBand ? `Band ${row.riskBand}` : "-"}</td>
                  <td className="py-2 pr-3 font-mono text-slate-700">{shortHash(row.credentialCommitment)}</td>
                  <td className="py-2 pr-3 font-mono text-slate-700">{shortHash(row.proofHash)}</td>
                  <td className="py-2 pr-3">
                    {row.explorerUrl || row.txHash ? (
                      <a
                        className="text-blue-600 hover:underline"
                        href={row.explorerUrl ?? explorerForDeploy(row.txHash ?? "") ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortHash(row.txHash)}
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">Subscription & Mint Outcomes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <th className="text-left py-2 pr-3">Asset</th>
                <th className="text-left py-2 pr-3">Investor</th>
                <th className="text-left py-2 pr-3">Mint Status</th>
                <th className="text-left py-2 pr-3">Payment Tx</th>
                <th className="text-left py-2 pr-3">Mint Tx</th>
              </tr>
            </thead>
            <tbody>
              {latestSubs.map((row, idx) => (
                <tr key={`${row.assetName ?? "asset"}-${idx}`} className="border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  <td className="py-2 pr-3 text-slate-700">{row.assetName ?? "-"}</td>
                  <td className="py-2 pr-3 font-mono text-slate-700">{shortHash(row.investorPublicKey)}</td>
                  <td className="py-2 pr-3 text-slate-700">{row.mintStatus ?? "-"}</td>
                  <td className="py-2 pr-3 font-mono text-slate-700">{shortHash(row.paymentTxHash)}</td>
                  <td className="py-2 pr-3 font-mono text-slate-700">{shortHash(row.mintTxHash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
