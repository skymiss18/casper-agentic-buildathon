import { buildProofEnvelope, generateCredentialSaltHex, toRiskBand, type RiskBand } from "@/lib/zk-credential";

export type KycAgentAction = "issue" | "update" | "revoke" | "manual_review" | "noop";

export interface KycAgentApplication {
  id: string;
  walletAddress: string;
  jurisdiction?: string | null;
  investorType?: "individual" | "institutional";
  pepDeclaration?: boolean;
  status?: string;
  aiScore?: number | null;
  kycExpiry?: number | null;
  credentialCommitment?: string | null;
  nullifierHash?: string | null;
  proofHash?: string | null;
  monitoringStatus?: string | null;
  lastScreenedAt?: string | null;
}

export interface KycAgentRecommendation {
  action: KycAgentAction;
  reason: string;
  riskBand: RiskBand;
  eligible: boolean;
  kycExpiry: number;
  confidence: number;
  envelope: {
    credentialCommitment: string;
    nullifierHash: string;
    proofHash: string;
  };
  updatePatch: Record<string, unknown>;
}

function defaultKycExpiry(): number {
  return Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
}

export function recommendKycAction(
  app: KycAgentApplication,
  options?: { issuerDomain?: string },
): KycAgentRecommendation {
  const now = Math.floor(Date.now() / 1000);
  const aiScore = Number(app.aiScore ?? 0);
  const riskBand = toRiskBand(aiScore);
  const kycExpiry = Number.isFinite(app.kycExpiry) && (app.kycExpiry ?? 0) > 0
    ? Math.floor(Number(app.kycExpiry))
    : defaultKycExpiry();

  const highRisk = riskBand >= 3;
  const expired = kycExpiry <= now;
  const pepFlag = Boolean(app.pepDeclaration);
  const rejected = app.status === "rejected";
  const hasCredential = !!app.credentialCommitment && !!app.nullifierHash && !!app.proofHash;

  let action: KycAgentAction = "noop";
  let reason = "Credential is healthy; no update required.";
  let confidence = 0.88;

  if (rejected || expired || aiScore < 50) {
    action = "revoke";
    reason = rejected
      ? "Application was rejected and must be revoked on-chain."
      : expired
        ? "KYC credential expired; revoke before re-issuance."
        : "AI risk score fell below critical threshold (<50).";
    confidence = 0.95;
  } else if (!hasCredential) {
    action = "issue";
    reason = "No active privacy-preserving credential found; issue required.";
    confidence = 0.93;
  } else if (pepFlag || highRisk || aiScore < 70) {
    action = "manual_review";
    reason = pepFlag
      ? "PEP declaration requires manual compliance review."
      : "Risk band or AI score indicates manual review before update.";
    confidence = 0.82;
  } else {
    action = "update";
    reason = "Credential should be refreshed with latest monitoring state.";
    confidence = 0.84;
  }

  const issuerDomain = options?.issuerDomain?.trim() || "nexusrwa.casper";
  const saltHex = generateCredentialSaltHex();
  const envelope = buildProofEnvelope({
    walletAddress: app.walletAddress,
    jurisdiction: app.jurisdiction?.trim() || "SG",
    investorType: app.investorType === "institutional" ? "institutional" : "individual",
    kycExpiry,
    riskBand,
    saltHex,
    eligible: action !== "revoke" && action !== "manual_review",
    issuerDomain,
    nullifierSaltHex: saltHex,
  });

  return {
    action,
    reason,
    riskBand,
    eligible: envelope.publicClaims.eligible,
    kycExpiry,
    confidence,
    envelope: {
      credentialCommitment: envelope.commitment,
      nullifierHash: envelope.nullifierHash,
      proofHash: envelope.proofHash,
    },
    updatePatch: {
      aiRiskScore: aiScore,
      riskBand,
      credentialCommitment: envelope.commitment,
      nullifierHash: envelope.nullifierHash,
      proofHash: envelope.proofHash,
      monitoringStatus: action,
      lastScreenedAt: new Date().toISOString(),
      agentReason: reason,
      kycExpiry,
    },
  };
}
