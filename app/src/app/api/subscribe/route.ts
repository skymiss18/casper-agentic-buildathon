import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { PublicKey } from "casper-js-sdk";
import {
  publicClient,
  getWalletClient,
  COMPLIANCE_MODULE_ABI,
  HARBOUR_RWA_TOKEN_ABI,
  moduleAddress,
  tokenAddress,
} from "@/lib/chain";
import { makeAssetIdCasper } from "@/lib/casper-chain";
import { mintCasperTokenCoupon, verifyCasperNativeTransfer } from "@/lib/casper-token-deploy";

// Check if wallet has an approved KYC record in local JSON store
type KycRecord = { walletAddress: string; status: string; aiScore: number | null; jurisdiction?: string };

type CasperDeployment = {
  assetName?: string;
  assetId?: string;
  contractHash?: string;
  status?: string;
  deployHash?: string;
  explorerUrl?: string;
};

type SfcAssetRecord = {
  asset?: string;
  status?: string;
  unitPrice?: string | number;
};

type SponsorAssetRecord = {
  assetName?: string;
  unitPrice?: string | number;
};

const MIN_CSPR_TRANSFER_MOTES = 2_500_000_000n;
const MOTES_PER_CSPR = 1_000_000_000n;
const USD_CENTS_PER_DEMO_CSPR = 100_000n; // Demo quote: 1 CSPR = USD 1,000.
const SUBSCRIPTION_FEE_BPS = 25n; // 0.25%

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

function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseCasperPublicKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return PublicKey.fromHex(value.trim()).toHex();
  } catch {
    return null;
  }
}

function readDeployments(): Record<string, CasperDeployment> {
  const filePath = join(process.cwd(), "data", "deployments.json");
  try {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, CasperDeployment>;
  } catch {
    return {};
  }
}

function findCasperDeployment(assetName: string) {
  const assetId = makeAssetIdCasper(assetName);
  const deployments = readDeployments();
  return Object.values(deployments).find((deployment) => {
    const byAssetId = deployment.assetId === assetId;
    const byName = deployment.assetName?.trim().toLowerCase() === assetName.trim().toLowerCase();
    return byAssetId || byName;
  });
}

function readJsonFile<T>(fileName: string, fallback: T): T {
  try {
    const filePath = join(process.cwd(), "data", fileName);
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function sameAssetName(left: string | undefined, right: string) {
  return left?.trim().toLowerCase() === right.trim().toLowerCase();
}

function parseUsdCents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replace(/[$,]/g, "");
  const match = text.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return null;
  const dollars = BigInt(match[1]);
  const cents = BigInt((match[2] ?? "").padEnd(2, "0"));
  return dollars * 100n + cents;
}

function findUnitPriceCents(assetName: string): bigint {
  const sfcRecords = readJsonFile<SfcAssetRecord[]>("sfc-inbox.json", []);
  const sfcRecord = sfcRecords.find((record) => record.status === "Approved" && sameAssetName(record.asset, assetName));
  const sfcPrice = parseUsdCents(sfcRecord?.unitPrice);
  if (sfcPrice && sfcPrice > 0n) return sfcPrice;

  const sponsorRecords = readJsonFile<SponsorAssetRecord[]>("sponsor-inbox.json", []);
  const sponsorRecord = sponsorRecords.find((record) => sameAssetName(record.assetName, assetName));
  const sponsorPrice = parseUsdCents(sponsorRecord?.unitPrice);
  if (sponsorPrice && sponsorPrice > 0n) return sponsorPrice;

  return 100_000n; // Fallback: USD 1,000 per token, matching the demo default.
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function expectedPaymentMotes(assetName: string, tokenCount: number): bigint {
  const principalCents = BigInt(tokenCount) * findUnitPriceCents(assetName);
  const totalDueCents = ceilDiv(principalCents * (10_000n + SUBSCRIPTION_FEE_BPS), 10_000n);
  const quotedMotes = ceilDiv(totalDueCents * MOTES_PER_CSPR, USD_CENTS_PER_DEMO_CSPR);
  return quotedMotes > MIN_CSPR_TRANSFER_MOTES ? quotedMotes : MIN_CSPR_TRANSFER_MOTES;
}

function refToTransferId(refNum?: string) {
  const source = refNum?.trim();
  if (!source) return undefined;

  let hash = 2166136261;
  for (const char of source) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function getTreasuryPublicKey() {
  const key = process.env.CASPER_TREASURY_PUBLIC_KEY
    ?? process.env.NEXT_PUBLIC_CASPER_TREASURY_PUBLIC_KEY
    ?? process.env.CASPER_ORACLE_PUBLIC_KEY
    ?? "";
  if (!key.trim()) {
    throw new Error("CASPER_TREASURY_PUBLIC_KEY is not configured");
  }
  return key.trim();
}

// POST /api/subscribe
// Body: { walletAddress, casperPublicKey?, tokenCount, assetName?, refNum?, paymentTxHash? }
// EVM path is kept for legacy Mantle demos; Casper path credits TokenCoupon after native CSPR payment.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawWalletAddress = body.walletAddress;
    const casperPublicKey = parseCasperPublicKey(body.casperPublicKey) ?? parseCasperPublicKey(rawWalletAddress);
    const tokenCount: number = Number(body.tokenCount ?? 20);
    const assetName: string = body.assetName ?? "Harbour Infrastructure Bond Token";
    const refNum: string = body.refNum ?? (buildRefPrefix(assetName) + Date.now().toString(36).toUpperCase().slice(-8));
    const paymentTxHash: string | undefined = typeof body.paymentTxHash === "string" ? body.paymentTxHash.trim() : undefined;

    if (tokenCount < 20 || tokenCount > 100_000) {
      return NextResponse.json({ error: "tokenCount must be 20–100,000" }, { status: 400 });
    }

    if (casperPublicKey) {
      if (!paymentTxHash?.trim()) {
        return NextResponse.json({ error: "paymentTxHash is required before minting Casper RWA token credit" }, { status: 400 });
      }

      const kycWalletAddress = isEvmAddress(rawWalletAddress) ? rawWalletAddress : casperPublicKey;
      const kycApproved = isKycApprovedLocally(kycWalletAddress) || process.env.CASPER_SUBSCRIBE_SKIP_LOCAL_KYC === "true";
      if (!kycApproved) {
        return NextResponse.json({
          eligible: false,
          onChain: false,
          txHash: null,
          refNum,
          message: "Investor is not eligible: KYC not verified or compliance score below 70. Complete KYC first.",
        }, { status: 422 });
      }

      const deployment = findCasperDeployment(assetName);
      if (!deployment) {
        return NextResponse.json({
          eligible: true,
          onChain: false,
          txHash: null,
          paymentTxHash,
          assetId: makeAssetIdCasper(assetName),
          assetName,
          tokenCount,
          walletAddress: kycWalletAddress,
          casperPublicKey,
          refNum,
          message: "Payment submitted, but TokenCoupon deployment was not found for this asset. Deploy/register it from /tokenize first.",
        }, { status: 409 });
      }

      const deploymentStatus = deployment.status?.toLowerCase() ?? "";
      const deploymentFailed =
        deploymentStatus.includes("failed")
        || deploymentStatus.includes("error")
        || deploymentStatus.includes("rejected")
        || deploymentStatus.includes("invalid");
      if (deploymentFailed) {
        return NextResponse.json({
          eligible: true,
          onChain: false,
          txHash: null,
          paymentTxHash,
          paymentStatus: "Rejected",
          assetId: deployment.assetId ?? makeAssetIdCasper(assetName),
          assetName,
          tokenCount,
          walletAddress: kycWalletAddress,
          casperPublicKey,
          refNum,
          deployHash: deployment.deployHash,
          explorerUrl: deployment.explorerUrl,
          message: "TokenCoupon deployment is in failed state. Re-run tokenize deployment after fixing install args.",
        }, { status: 409 });
      }

      if (!deployment.contractHash) {
        return NextResponse.json({
          eligible: true,
          onChain: false,
          txHash: null,
          paymentTxHash,
          paymentStatus: "Pending",
          assetId: deployment.assetId ?? makeAssetIdCasper(assetName),
          assetName,
          tokenCount,
          walletAddress: kycWalletAddress,
          casperPublicKey,
          refNum,
          deployHash: deployment.deployHash,
          explorerUrl: deployment.explorerUrl,
          message: "TokenCoupon deployment exists but contract hash is not finalized yet. Wait for Casper deploy finality, then retry token credit.",
        }, { status: 202 });
      }

      const expectedMotes = expectedPaymentMotes(assetName, tokenCount);
      const paymentVerification = await verifyCasperNativeTransfer({
        transactionHash: paymentTxHash,
        expectedSenderPublicKey: casperPublicKey,
        expectedRecipientPublicKey: getTreasuryPublicKey(),
        expectedMinimumMotes: expectedMotes.toString(),
        expectedTransferId: refToTransferId(refNum),
      });

      if (!paymentVerification.ok) {
        const responseStatus = paymentVerification.status === "Pending" ? 202 : 422;
        return NextResponse.json({
          eligible: true,
          onChain: false,
          txHash: null,
          paymentTxHash,
          paymentStatus: paymentVerification.status,
          paymentVerification,
          expectedPaymentMotes: expectedMotes.toString(),
          assetId: deployment.assetId ?? makeAssetIdCasper(assetName),
          assetName,
          tokenCount,
          walletAddress: kycWalletAddress,
          casperPublicKey,
          refNum,
          message: paymentVerification.status === "Pending"
            ? "CSPR payment has been submitted but is not finalized yet. Retry token credit after Casper confirms the transfer."
            : paymentVerification.reason ?? "CSPR payment verification failed; RWA token credit was not minted.",
        }, { status: responseStatus });
      }

      const paymentRef = `${refNum}:${paymentTxHash}`;
      const mintResult = await mintCasperTokenCoupon({
        contractHash: deployment.contractHash,
        investorPublicKey: casperPublicKey,
        amount: String(tokenCount),
        paymentRef,
      });

      return NextResponse.json({
        eligible: true,
        onChain: true,
        txHash: mintResult.deployHash,
        mintTxHash: mintResult.deployHash,
        paymentTxHash,
        paymentStatus: paymentVerification.status,
        paymentVerification,
        expectedPaymentMotes: expectedMotes.toString(),
        contractHash: deployment.contractHash,
        assetId: deployment.assetId ?? makeAssetIdCasper(assetName),
        assetName,
        tokenCount,
        walletAddress: kycWalletAddress,
        casperPublicKey,
        refNum,
        status: mintResult.status,
        pendingReason: mintResult.pendingReason,
        explorerUrl: mintResult.explorerUrl,
        message: mintResult.status === "Minted"
          ? `${tokenCount} ${assetName} tokens credited on Casper TokenCoupon after confirmed CSPR payment.`
          : `${tokenCount} ${assetName} token credit submitted on Casper TokenCoupon after confirmed CSPR payment.`,
      });
    }

    const walletAddress: `0x${string}` = rawWalletAddress;
    if (!isEvmAddress(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const assetId: `0x${string}` = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), [assetName])
    );

    const moduleAddr = moduleAddress();
    const tokenAddr = tokenAddress();
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const isConfigured =
      privateKey &&
      moduleAddr !== "0x0000000000000000000000000000000000000000" &&
      tokenAddr !== "0x0000000000000000000000000000000000000000";

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

    // ── 2. Legacy EVM mint path ───────────────────────────────────────────────
    let txHash: string | null = null;
    let onChain = false;

    if (isConfigured && onChainEligible) {
      const walletClient = getWalletClient();
      const amount = BigInt(tokenCount) * BigInt(10 ** 18);

      const gasPrice = await publicClient.getGasPrice();
      const safeGasPrice = gasPrice * 2n;

      const assetInfo = await publicClient.readContract({
        address: tokenAddr,
        abi: HARBOUR_RWA_TOKEN_ABI,
        functionName: "assets",
        args: [assetId],
      }) as readonly [boolean, number, string, bigint, bigint, `0x${string}`];

      if (!assetInfo[0]) {
        const nameLower = assetName.toLowerCase();
        const assetTypeNum = nameLower.includes("reit") ? 0
          : nameLower.includes("green") ? 1
          : nameLower.includes("trade") || nameLower.includes("receivable") ? 2
          : 3;

        const couponBps = 550n;
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
        await publicClient.waitForTransactionReceipt({ hash: regTxHash });
      }

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
        ? `https://testnet.cspr.live/deploy/${txHash}`
        : null,
      message: onChain
        ? `${tokenCount} tokens of ${assetName} minted on Casper. Settlement: T+2.`
        : `Eligibility confirmed (contracts not yet deployed — deploy first). Reference: ${refNum}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
