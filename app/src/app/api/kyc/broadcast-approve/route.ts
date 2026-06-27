import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { broadcastSignedDeploy } from "@/lib/casper-token-deploy";
import { isCasperPublicKeyHex } from "@/lib/casper-address";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      deployToken?: string;
      deployJson?: Record<string, unknown>;
      signatureHex?: string;
      signerPublicKey?: string;
    };

    let deployJson: Record<string, unknown> | undefined = body.deployJson;

    if (body.deployToken) {
      if (!/^[0-9a-f]{32}$/.test(body.deployToken)) {
        return NextResponse.json({ error: "Invalid deployToken" }, { status: 400 });
      }
      const filePath = path.resolve(process.cwd(), "data/pending-kyc-approvals", `deploy-${body.deployToken}.json`);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Deploy token not found or expired" }, { status: 404 });
      }
      const stored = JSON.parse(fs.readFileSync(filePath, "utf8")) as { deployJson: Record<string, unknown>; signerPublicKey: string };
      deployJson = stored.deployJson;
      fs.unlinkSync(filePath);
    }

    if (!deployJson) {
      return NextResponse.json({ error: "deployToken or deployJson is required" }, { status: 400 });
    }
    if (!body.signatureHex?.trim()) {
      return NextResponse.json({ error: "signatureHex is required" }, { status: 400 });
    }
    if (!body.signerPublicKey?.trim()) {
      return NextResponse.json({ error: "signerPublicKey is required" }, { status: 400 });
    }
    if (!isCasperPublicKeyHex(body.signerPublicKey.trim())) {
      return NextResponse.json({ error: "signerPublicKey must be a Casper public key" }, { status: 400 });
    }

    const result = await broadcastSignedDeploy({
      deployJson,
      signatureHex: body.signatureHex.trim(),
      signerPublicKey: body.signerPublicKey.trim(),
    });

    return NextResponse.json({
      success: true,
      txHash: result.deployHash,
      deployHash: result.deployHash,
      network: "Casper Testnet",
      status: result.status,
      pendingReason: result.pendingReason,
      explorerUrl: result.explorerUrl,
      contractHash: result.contractHash,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Casper KYC broadcast failed";
    const isExecutionFailure = /execution failed|User error:|MissingArg|ApiError::User/i.test(msg);
    return NextResponse.json(
      {
        error: msg,
        errorType: isExecutionFailure ? "ExecutionFailure" : "BroadcastFailure",
      },
      { status: isExecutionFailure ? 422 : 500 }
    );
  }
}