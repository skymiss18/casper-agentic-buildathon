import { NextRequest, NextResponse } from "next/server";
import { publicClient, getWalletClient, IDENTITY_REGISTRY_ABI, registryAddress } from "@/lib/chain";
import { keccak256, toHex } from "viem";

// POST /api/kyc/submit
// Body: { walletAddress, jurisdiction, kycExpiryDays }
// Registers investor in IdentityRegistry on-chain
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const walletAddress: `0x${string}` = body.walletAddress;
    const jurisdiction: string         = body.jurisdiction ?? "SG";
    const kycExpiryDays: number        = body.kycExpiryDays ?? 365;

    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const privateKey  = process.env.DEPLOYER_PRIVATE_KEY;
    const registryAddr = registryAddress();
    const isConfigured = privateKey && registryAddr !== "0x0000000000000000000000000000000000000000";

    const kycExpiry = BigInt(Math.floor(Date.now() / 1000) + kycExpiryDays * 86400);
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
        args: [walletAddress, true, true, jurisdictionHash, kycExpiry],
        maxFeePerGas: safeGasPrice,
        maxPriorityFeePerGas: safeGasPrice,
      });
    }

    return NextResponse.json({
      walletAddress,
      jurisdiction,
      kycExpiry: kycExpiry.toString(),
      onChain: !!txHash,
      txHash,
      message: txHash
        ? "KYC successfully registered on Mantle"
        : "KYC validated (contracts not yet deployed — deploy first)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
