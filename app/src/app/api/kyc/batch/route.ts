import { NextRequest, NextResponse } from "next/server";
import { publicClient, getWalletClient, IDENTITY_REGISTRY_ABI, registryAddress } from "@/lib/chain";
import { keccak256, toHex } from "viem";

export const runtime = "nodejs";
export const maxDuration = 120;

interface KYCEntry {
  wallet: string;
  jurisdiction?: string;
}

interface KYCResult {
  wallet: string;
  jurisdiction: string;
  status: "ok" | "error" | "invalid";
  txHash: string | null;
  message: string;
  error?: string;
}

// POST /api/kyc/batch
// Body: { addresses: KYCEntry[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries: KYCEntry[] = body.addresses ?? [];

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "addresses array is required" }, { status: 400 });
    }
    if (entries.length > 100) {
      return NextResponse.json({ error: "Maximum 100 addresses per batch" }, { status: 400 });
    }

    const privateKey    = process.env.DEPLOYER_PRIVATE_KEY;
    const registryAddr  = registryAddress();
    const isConfigured  = !!privateKey && registryAddr !== "0x0000000000000000000000000000000000000000";

    const kycExpiryBase = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);

    const results: KYCResult[] = [];

    for (const entry of entries) {
      const wallet      = entry.wallet?.trim() ?? "";
      const jurisdiction = entry.jurisdiction?.trim() || "SG";

      // Validate address
      if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
        results.push({
          wallet,
          jurisdiction,
          status: "invalid",
          txHash: null,
          message: "Invalid Ethereum address format",
        });
        continue;
      }

      try {
        const jurisdictionHash = keccak256(toHex(jurisdiction));
        let txHash: string | null = null;

        if (isConfigured) {
          const walletClient = getWalletClient();
          const gasPrice = await publicClient.getGasPrice();
          const safeGasPrice = gasPrice * 2n;
          txHash = await walletClient.writeContract({
            address: registryAddr,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "upsertInvestor",
            args: [wallet as `0x${string}`, true, true, jurisdictionHash, kycExpiryBase],
            maxFeePerGas: safeGasPrice,
            maxPriorityFeePerGas: safeGasPrice,
          });
        }

        results.push({
          wallet,
          jurisdiction,
          status: "ok",
          txHash,
          message: txHash
            ? "KYC registered on Mantle"
            : "KYC validated (contracts not yet deployed)",
        });
      } catch (err) {
        results.push({
          wallet,
          jurisdiction,
          status: "error",
          txHash: null,
          message: "On-chain registration failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => r.status === "ok").length;
    const failed    = results.filter((r) => r.status === "error").length;
    const invalid   = results.filter((r) => r.status === "invalid").length;

    return NextResponse.json({ total: entries.length, succeeded, failed, invalid, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Batch KYC failed" },
      { status: 500 }
    );
  }
}
