import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import artifact from "@/contracts/artifacts/contracts/HarbourRWAToken.sol/HarbourRWAToken.json";

export const runtime = "nodejs";
// Real deployments can take >10 s on testnet
export const maxDuration = 60;

const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: {
    default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" },
  },
});

// POST /api/tokenize/deploy
// Body: { assetName, assetType, sfcRef, approvedBy, totalIssuance, currency }
// Deploys a real HarbourRWAToken (ERC-3643) on Mantle Sepolia testnet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: "DEPLOYER_PRIVATE_KEY not configured" }, { status: 500 });
    }

    const complianceModule = process.env.NEXT_PUBLIC_COMPLIANCE_MODULE_ADDRESS as `0x${string}`;
    if (!complianceModule) {
      return NextResponse.json({ error: "NEXT_PUBLIC_COMPLIANCE_MODULE_ADDRESS not configured" }, { status: 500 });
    }

    const couponToken = (process.env.NEXT_PUBLIC_USDY_ADDRESS ?? process.env.USDY_ADDRESS) as `0x${string}` | undefined;
    if (!couponToken) {
      return NextResponse.json({ error: "NEXT_PUBLIC_USDY_ADDRESS or USDY_ADDRESS not configured" }, { status: 500 });
    }

    const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(pk);

    const publicClient = createPublicClient({
      chain: mantleSepolia,
      transport: http("https://rpc.sepolia.mantle.xyz"),
    });
    const walletClient = createWalletClient({
      account,
      chain: mantleSepolia,
      transport: http("https://rpc.sepolia.mantle.xyz"),
    });

    // Derive a short symbol from the asset name (first 6 chars, uppercase, no spaces)
    const rawName: string = body.assetName ?? "HARBOUR RWA TOKEN";
    const symbol = rawName.replace(/\s+/g, "").toUpperCase().slice(0, 6) || "HRWAT";

    // Deploy HarbourRWAToken(name, symbol, admin, complianceModule, couponToken)
    const gasPrice = await publicClient.getGasPrice();
    const safeGasPrice = gasPrice * 2n;
    const txHash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode as `0x${string}`,
      args: [rawName, symbol, account.address, complianceModule, couponToken],
      maxFeePerGas: safeGasPrice,
      maxPriorityFeePerGas: safeGasPrice,
    });

    // Wait for receipt (up to ~50 s)
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 50_000 });

    return NextResponse.json({
      success: true,
      txHash,
      contractAddress: receipt.contractAddress ?? "",
      blockNumber: Number(receipt.blockNumber),
      network: "Mantle Sepolia",
      deployedAt: new Date().toISOString().slice(0, 10),
      assetName: rawName,
      assetType: body.assetType ?? "",
      sfcRef: body.sfcRef ?? "",
      standard: "ERC-3643",
      gasUsed: Number(receipt.gasUsed),
      explorerUrl: `https://sepolia.mantlescan.xyz/tx/${txHash}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deploy failed" },
      { status: 500 }
    );
  }
}
