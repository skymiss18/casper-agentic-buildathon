import { NextResponse } from "next/server";
import { readDeploymentsWithReconciliation } from "@/lib/casper-deployments";

export const runtime = "nodejs";

const HASH_REF_REGEX = /^(?:contract-|hash-)?[0-9a-fA-F]{64}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assetDeploymentId = searchParams.get("assetDeploymentId")?.trim() || "";
  const deployments = await readDeploymentsWithReconciliation() as Record<string, { identityRegistry?: { contractHash?: string } }>;
  const globalIdentityRegistryHash = process.env.CASPER_IDENTITY_REGISTRY_HASH?.trim() || "";
  const identityRegistryHash = assetDeploymentId
    ? (deployments[assetDeploymentId]?.identityRegistry?.contractHash?.trim() || globalIdentityRegistryHash)
    : globalIdentityRegistryHash;
  const chainName = process.env.CASPER_CHAIN_NAME?.trim() || "casper-test";

  if (!identityRegistryHash) {
    return NextResponse.json({
      identityRegistryConfigured: false,
      chainName,
      error: assetDeploymentId
        ? `Casper Identity Registry is not deployed for asset ${assetDeploymentId}. Deploy that asset's identity-registry first from /tokenize.`
        : "Select the target asset issuance before approving KYC on-chain, or set CASPER_IDENTITY_REGISTRY_HASH for global fallback.",
    });
  }

  if (!HASH_REF_REGEX.test(identityRegistryHash)) {
    return NextResponse.json({
      identityRegistryConfigured: false,
      chainName,
      error: assetDeploymentId
        ? `Identity registry hash resolved for asset ${assetDeploymentId} is invalid. Expected contract-<64 hex chars>.`
        : "CASPER_IDENTITY_REGISTRY_HASH is invalid. Expected contract-<64 hex chars>.",
    });
  }

  return NextResponse.json({
    identityRegistryConfigured: true,
    chainName,
    identityRegistryHash,
    assetDeploymentId,
  });
}