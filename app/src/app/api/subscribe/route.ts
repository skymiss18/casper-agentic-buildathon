import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import {
  publicClient,
  getWalletClient,
  COMPLIANCE_MODULE_ABI,
  HARBOUR_RWA_TOKEN_ABI,
  moduleAddress,
  tokenAddress,
} from "@/lib/chain";

// Check if wallet has an approved KYC record in local JSON store
type KycRecord = { walletAddress: string; status: string; aiScore: number | null; jurisdiction?: string };

function buildRefPrefix(assetName: string) {
  const cleaned = assetName.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (cleaned.slice(0, 4) || "RWA") + "-";
}

function readKycApps(): KycRecord[] {
  const filePath = join(process.cwd(), "data", "kyc-inbox.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as KycRecord[];
}

function isKycApprovedLocally(walletAddress: string): boolean {
  try {
    return readKycApps().some(
      (a) =>
        a.walletAddress?.toLowerCase() === walletAddress.toLowerCase() &&
        a.status === "approved" &&
        (a.aiScore ?? 0) >= 70
    );
  } catch { return false; }
}

// POST /api/subscribe
// Body: { walletAddress, tokenCount, assetName?, refNum? }
// 1. Checks ComplianceModule.canMint(walletAddress, assetId)
// 2. If contracts are configured: mints tokens via HarbourRWAToken.mintForAsset
// 3. Returns { eligible, txHash, onChain, refNum }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const walletAddress: `0x${string}` = body.walletAddress;
    const tokenCount: number           = body.tokenCount ?? 20;
    const assetName: string            = body.assetName ?? "Harbour Infrastructure Bond Token";
    const refNum: string               = body.refNum ?? (buildRefPrefix(assetName) + Date.now().toString(36).toUpperCase().slice(-8));

    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }
    if (tokenCount < 20 || tokenCount > 100_000) {
      return NextResponse.json({ error: "tokenCount must be 20–100,000" }, { status: 400 });
    }

    const assetId: `0x${string}` = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), [assetName])
    );

    const moduleAddr = moduleAddress();
    const tokenAddr  = tokenAddress();
    const privateKey  = process.env.DEPLOYER_PRIVATE_KEY;
    const isConfigured =
      privateKey &&
      moduleAddr  !== "0x0000000000000000000000000000000000000000" &&
      tokenAddr   !== "0x0000000000000000000000000000000000000000";

    // ── 1. Compliance eligibility check ──────────────────────────────────────
    let eligible = false;
    let onChainEligible = false;

    if (isConfigured) {
      try {
        onChainEligible = await publicClient.readContract({
          address: moduleAddr,
          abi: COMPLIANCE_MODULE_ABI,
          functionName: "canMint",
          args: [walletAddress, assetId],
        }) as boolean;
        eligible = onChainEligible;
      } catch { /* canMint read failed */ }

      // Fallback: KYC approved locally but not yet on-chain (e.g. legacy records)
      if (!onChainEligible) {
        eligible = isKycApprovedLocally(walletAddress);
        // Keep onChainEligible false: local KYC alone cannot bypass on-chain asset approval.
        onChainEligible = false;
      }
    } else {
      eligible = isKycApprovedLocally(walletAddress);
      onChainEligible = false;
    }

    if (!eligible) {
      return NextResponse.json({
        eligible: false,
        onChain: false,
        txHash: null,
        assetId,
        refNum,
        message: "Investor is not eligible: KYC not verified or compliance score below 70. Complete KYC first.",
      }, { status: 422 });
    }

    // ── 2. Mint tokens on-chain ───────────────────────────────────────────────
    let txHash: string | null = null;
    let onChain = false;

    if (isConfigured && onChainEligible) {
      const walletClient = getWalletClient();
      const amount = BigInt(tokenCount) * BigInt(10 ** 18);

      // Fetch current gas price to avoid "replacement transaction underpriced" on Mantle Sepolia
      const gasPrice = await publicClient.getGasPrice();
      // Use 2× current gas price to safely replace any stuck pending txs
      const safeGasPrice = gasPrice * 2n;

      // ── Ensure asset is registered before minting ─────────────────────────
      // mintForAsset reverts with AssetNotApproved if registerAsset was never called.
      // Check on-chain and register automatically if needed.
      const assetInfo = await publicClient.readContract({
        address: tokenAddr,
        abi: HARBOUR_RWA_TOKEN_ABI,
        functionName: "assets",
        args: [assetId],
      }) as readonly [boolean, number, string, bigint, bigint, `0x${string}`];

      if (!assetInfo[0]) {
        // Derive a simple asset type from the name (default: Bond = 3)
        const nameLower = assetName.toLowerCase();
        const assetTypeNum = nameLower.includes("reit") ? 0
          : nameLower.includes("green") ? 1
          : nameLower.includes("trade") || nameLower.includes("receivable") ? 2
          : 3; // Bond

        // 5.5 % coupon, maturity 15 Jul 2031
        const couponBps    = 550n;
        const maturityDate = BigInt(Math.floor(new Date("2031-07-15T00:00:00Z").getTime() / 1000));
        const prospectusHash = keccak256(
          encodeAbiParameters(parseAbiParameters("string"), [assetName])
        );

        const regTxHash = await walletClient.writeContract({
          address: tokenAddr,
          abi: HARBOUR_RWA_TOKEN_ABI,
          functionName: "registerAsset",
          args: [assetId, assetTypeNum, assetName, maturityDate, couponBps, prospectusHash],
          maxFeePerGas: safeGasPrice,
          maxPriorityFeePerGas: safeGasPrice,
        });
        // Wait for registration to be mined before minting
        await publicClient.waitForTransactionReceipt({ hash: regTxHash });
      }
      // ─────────────────────────────────────────────────────────────────────

      txHash = await walletClient.writeContract({
        address: tokenAddr,
        abi: HARBOUR_RWA_TOKEN_ABI,
        functionName: "mintForAsset",
        args: [walletAddress, amount, assetId],
        maxFeePerGas: safeGasPrice,
        maxPriorityFeePerGas: safeGasPrice,
      });
      onChain = true;
    }

    return NextResponse.json({
      eligible: true,
      onChain,
      txHash,
      assetId,
      assetName,
      tokenCount,
      walletAddress,
      refNum,
      explorerUrl: txHash
        ? `https://sepolia.mantlescan.xyz/tx/${txHash}`
        : null,
      message: onChain
        ? `${tokenCount} tokens of ${assetName} minted on Mantle. Settlement: T+2.`
        : `Eligibility confirmed (contracts not yet deployed — deploy first). Reference: ${refNum}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
