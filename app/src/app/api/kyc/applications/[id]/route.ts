import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import {
  publicClient,
  getWalletClient,
  IDENTITY_REGISTRY_ABI,
  registryAddress,
} from "@/lib/chain";

export const runtime = "nodejs";

const DATA_PATH = path.join(process.cwd(), "data", "kyc-inbox.json");

function readApps(): Record<string, unknown>[] {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeApps(apps: Record<string, unknown>[]) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(apps, null, 2), "utf-8");
}

async function registerOnChain(app: Record<string, unknown>) {
  try {
    const walletAddress = app.walletAddress as `0x${string}`;
    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) return;

    const registryAddr = registryAddress();
    if (registryAddr === "0x0000000000000000000000000000000000000000") return;

    const jurisdiction = (app.jurisdiction as string) ?? "SG";
    const jurisdictionBytes = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), [jurisdiction])
    );
    const kycExpiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600); // 1 year

    const walletClient = getWalletClient();
    const gasPrice = await publicClient.getGasPrice();
    const safeGasPrice = gasPrice * 2n;
    await walletClient.writeContract({
      address: registryAddr,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "upsertInvestor",
      args: [walletAddress, true, true, jurisdictionBytes, kycExpiry],
      maxFeePerGas: safeGasPrice,
      maxPriorityFeePerGas: safeGasPrice,
    });
  } catch (err) {
    // Log but don't fail the PATCH — on-chain registration is best-effort
    console.error("[KYC approve] on-chain registration failed:", err instanceof Error ? err.message : err);
  }
}

// PATCH /api/kyc/applications/[id] — intermediary updates status, aiScore, reviewNotes, txHash
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patch = await req.json() as Record<string, unknown>;

    const apps = readApps();
    const idx  = apps.findIndex((a) => a.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Only allow updating safe fields; never overwrite id or submittedAt
    const ALLOWED = ["status", "aiScore", "aiSummary", "aiBreakdown", "reviewNotes", "txHash"] as const;
    for (const key of ALLOWED) {
      if (key in patch) {
        apps[idx][key] = patch[key];
      }
    }

    writeApps(apps);

    // When status changes to "approved", register investor on-chain immediately
    if (patch.status === "approved") {
      await registerOnChain(apps[idx]);
    }

    return NextResponse.json({ application: apps[idx] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
