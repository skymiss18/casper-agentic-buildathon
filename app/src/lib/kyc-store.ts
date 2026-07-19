import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "kyc-inbox.json");

export type KycApplicationRecord = Record<string, unknown> & {
  id: string;
  walletAddress?: string;
  jurisdiction?: string;
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
  agentReason?: string | null;
};

export function readKycApplications(): KycApplicationRecord[] {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as KycApplicationRecord[];
  } catch {
    return [];
  }
}

export function writeKycApplications(applications: KycApplicationRecord[]) {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_PATH, JSON.stringify(applications, null, 2), "utf-8");
}

export function upsertKycApplication(id: string, patch: Record<string, unknown>) {
  const applications = readKycApplications();
  const index = applications.findIndex((item) => item.id === id);
  if (index < 0) {
    return null;
  }
  applications[index] = { ...applications[index], ...patch };
  writeKycApplications(applications);
  return applications[index];
}
