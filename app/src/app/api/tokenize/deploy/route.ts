import { NextRequest, NextResponse } from "next/server";
import { makeAssetIdCasper } from "@/lib/casper-chain";
import { deployCasperTokenCoupon } from "@/lib/casper-token-deploy";

export const runtime = "nodejs";
export const maxDuration = 300;

function makeSymbol(assetName: string) {
  const parenSymbol = assetName.match(/\(([A-Z0-9]{2,12})\)/)?.[1];
  if (parenSymbol) return parenSymbol.slice(0, 12);
  return assetName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "HRWA";
}

// POST /api/tokenize/deploy
// Body: { id, assetName, assetType, issuer, sfcRef, approvedBy, totalIssuance, currency }
// Deploys the configured Casper TokenCoupon WASM to Casper Testnet.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string;
      assetName?: string;
      assetType?: string;
      issuer?: string;
      sfcRef?: string;
      approvedBy?: string;
      totalIssuance?: string;
      currency?: string;
    };

    const rawName = body.assetName?.trim() || "Harbour RWA Issuance";
    const assetId = makeAssetIdCasper(rawName);
    const symbol = makeSymbol(rawName);
    const issuer = body.issuer?.trim() || "Harbour Capital Markets Corporation Limited";
    const totalIssuance = body.totalIssuance?.trim() || "0";
    const currency = body.currency?.trim() || "USD";
    const sfcRef = body.sfcRef?.trim() || body.id || "";

    const result = await deployCasperTokenCoupon({
      assetId,
      assetName: rawName,
      symbol,
      issuer,
      totalIssuance,
      currency,
      sfcRef,
      complianceOracleHash: process.env.CASPER_COMPLIANCE_ORACLE_HASH,
      identityRegistryHash: process.env.CASPER_IDENTITY_REGISTRY_HASH,
    });

    const deployedAt = new Date().toISOString().slice(0, 10);

    return NextResponse.json({
      success: true,
      txHash: result.deployHash,
      deployHash: result.deployHash,
      registrationId: result.deployHash,
      assetId,
      contractHash: result.contractHash,
      contractAddress: result.contractHash,
      blockNumber: null,
      network: "Casper Testnet",
      deployedAt,
      assetName: rawName,
      assetType: body.assetType ?? "",
      issuer,
      sfcRef,
      approvedBy: body.approvedBy ?? "",
      totalIssuance,
      currency,
      standard: "Casper Token/Coupon WASM",
      status: result.status,
      pendingReason: result.pendingReason,
      gasUsed: 0,
      explorerUrl: result.explorerUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Casper token deploy failed" },
      { status: 500 }
    );
  }
}
