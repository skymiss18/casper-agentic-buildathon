import { keccak256, toHex, encodeAbiParameters, parseAbiParameters } from "viem";
import { publicClient, getWalletClient, COMPLIANCE_ORACLE_ABI, oracleAddress } from "./chain";
import {
  submitScoreCasper,
  getScoreCasper,
  makeAssetIdCasper,
  casperExplorerDeployUrl,
} from "./casper-chain";

// ── Network selector ──────────────────────────────────────────────────────────

/** Casper is the default; set NEXT_PUBLIC_ORACLE_CHAIN=mantle only for the legacy EVM path. */
const oracleChain = (): "mantle" | "casper" =>
  process.env.NEXT_PUBLIC_ORACLE_CHAIN === "mantle" ? "mantle" : "casper";

// ── Legacy EVM helpers ─────────────────────────────────────────────────────────

export function makeReportHash(reportJson: string): `0x${string}` {
  return keccak256(toHex(reportJson));
}

export function makeAssetId(assetName: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string"), [assetName])
  );
}

// ── Unified write: submit compliance score ─────────────────────────────────────

/**
 * Submit an AI compliance score on-chain.
 * Routes to Casper Testnet by default, or the legacy EVM path when explicitly configured.
 *
 * @returns object with txHash and optional explorerUrl
 */
export async function submitScoreOnChain(
  assetId: `0x${string}`,
  score: number,
  reportJson: string,
  assetName?: string
): Promise<{ txHash: string; explorerUrl?: string }> {
  if (oracleChain() === "casper") {
    // Casper path: use the human-readable asset name as the mapping key.
    const casperAssetId = makeAssetIdCasper(assetName ?? assetId);
    const reportHashHex = makeReportHash(reportJson);
    const deployHash = await submitScoreCasper(casperAssetId, Math.round(score), reportHashHex);
    return {
      txHash: deployHash,
      explorerUrl: casperExplorerDeployUrl(deployHash),
    };
  }

  // Legacy EVM path — original behaviour
  const reportHash = makeReportHash(reportJson);
  const walletClient = getWalletClient();
  const txHash = await walletClient.writeContract({
    address: oracleAddress(),
    abi: COMPLIANCE_ORACLE_ABI,
    functionName: "submitScore",
    args: [assetId, Math.round(score), reportHash],
  });
  return { txHash };
}

// ── Unified read: get compliance score ────────────────────────────────────────

export async function getScoreFromChain(assetId: `0x${string}`, assetName?: string) {
  if (oracleChain() === "casper") {
    const casperAssetId = makeAssetIdCasper(assetName ?? assetId);
    const record = await getScoreCasper(casperAssetId);
    return {
      score: record.score,
      updatedAt: BigInt(record.updatedAt),
      reportHash: record.reportHash as `0x${string}`,
    };
  }

  // Legacy EVM path
  const data = await publicClient.readContract({
    address: oracleAddress(),
    abi: COMPLIANCE_ORACLE_ABI,
    functionName: "getScore",
    args: [assetId],
  });
  return { score: data[0], updatedAt: data[1], reportHash: data[2] };
}
