import fs from "fs";
import path from "path";
import { KeyAlgorithm, PrivateKey } from "casper-js-sdk";
import { getCasperRpcUrls, makeAssetIdCasper } from "./casper-chain";

const DATA_FILE = path.join(process.cwd(), "data", "deployments.json");

export interface CasperContractDeploymentRecord {
  txHash?: string;
  deployHash?: string;
  registrationId?: string;
  assetId?: string;
  assetName?: string;
  symbol?: string;
  contractHash?: string;
  contractAddress?: string;
  blockNumber?: number | null;
  network?: string;
  deployedAt?: string;
  standard?: string;
  gasUsed?: number | null;
  explorerUrl?: string;
  status?: string;
  pendingReason?: string;
  deployerPublicKey?: string;
}

export interface CasperDeploymentRecord extends CasperContractDeploymentRecord {
  identityRegistry?: CasperContractDeploymentRecord;
}

type DeployResultPayload = {
  result?: {
    deploy?: {
      header?: {
        account?: string;
      };
    };
    execution_results?: Array<{
      result?: {
        Failure?: {
          error_message?: string;
        };
        Success?: unknown;
      };
    }>;
  };
};

type AccountInfoPayload = {
  result?: {
    account?: {
      named_keys?: Array<{ name?: string; key?: string }>;
    };
  };
};

function readRawDeployments(): Record<string, CasperDeploymentRecord> {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as Record<string, CasperDeploymentRecord>;
  } catch {
    return {};
  }
}

export function writeDeployments(data: Record<string, CasperDeploymentRecord>) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function isCasperTokenCouponDeployment(deployment: CasperContractDeploymentRecord) {
  return (deployment.network ?? "").toLowerCase().includes("casper")
    && (deployment.standard ?? "").toLowerCase().includes("casper token/coupon wasm");
}

function isCasperIdentityRegistryDeployment(deployment: CasperContractDeploymentRecord) {
  return (deployment.network ?? "").toLowerCase().includes("casper")
    && (deployment.standard ?? "").toLowerCase().includes("casper identity registry wasm");
}

function normalizeContractHash(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^contract-[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(/^hash-([0-9a-f]{64})$/i);
  if (match) return `contract-${match[1].toLowerCase()}`;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return `contract-${trimmed.toLowerCase()}`;
  return undefined;
}

function getOraclePublicKey(): string | undefined {
  const explicit = process.env.CASPER_ORACLE_PUBLIC_KEY?.trim();
  if (explicit) return explicit;
  const privateKeyHex = process.env.CASPER_ORACLE_KEY?.trim();
  if (!privateKeyHex) return undefined;
  try {
    return PrivateKey.fromHex(privateKeyHex, KeyAlgorithm.ED25519).publicKey.toHex();
  } catch {
    return undefined;
  }
}

async function rpcCall<T>(method: string, params: Record<string, unknown>) {
  const rpcUrls = getCasperRpcUrls();
  let lastError: string | undefined;
  for (const rpcUrl of rpcUrls) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = await response.json() as T & { error?: { message?: string } };
      if (!(payload as { error?: { message?: string } }).error) return payload;
      lastError = (payload as { error?: { message?: string } }).error?.message ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError ?? `RPC call failed: ${method}`);
}

async function fetchDeployMetadata(deployHash: string) {
  try {
    const payload = await rpcCall<DeployResultPayload>("info_get_deploy", { deploy_hash: deployHash });
    const executionResult = payload.result?.execution_results?.[0]?.result;
    return {
      account: payload.result?.deploy?.header?.account,
      failureMessage: executionResult?.Failure?.error_message,
    };
  } catch {
    return { account: undefined, failureMessage: undefined };
  }
}

async function fetchNamedKeyContractHash(publicKey: string, namedKeyName: string) {
  try {
    const payload = await rpcCall<AccountInfoPayload>("state_get_account_info", { public_key: publicKey });
    const expectedName = namedKeyName.trim().toLowerCase();
    const namedKeys = payload.result?.account?.named_keys ?? [];
    const match = namedKeys.find((entry) => entry.name?.trim().toLowerCase() === expectedName);
    return normalizeContractHash(match?.key);
  } catch {
    return undefined;
  }
}

function makeNamedKeyName(prefix: "token_coupon" | "identity_registry", assetId: string) {
  return `${prefix}_${makeAssetIdCasper(assetId).toLowerCase()}`;
}

async function reconcileContractDeployment(
  deployment: CasperContractDeploymentRecord,
  kind: "tokenCoupon" | "identityRegistry",
) {
  const isSupported = kind === "tokenCoupon"
    ? isCasperTokenCouponDeployment(deployment)
    : isCasperIdentityRegistryDeployment(deployment);
  if (!isSupported) return deployment;

  const normalizedExistingHash = normalizeContractHash(deployment.contractHash);
  if (normalizedExistingHash && deployment.status === "Deployed") {
    return normalizedExistingHash === deployment.contractHash ? deployment : {
      ...deployment,
      contractHash: normalizedExistingHash,
      contractAddress: deployment.contractAddress ?? normalizedExistingHash,
    };
  }

  const next: CasperDeploymentRecord = { ...deployment };
  if (normalizedExistingHash) {
    next.contractHash = normalizedExistingHash;
    next.contractAddress = next.contractAddress ?? normalizedExistingHash;
    next.status = "Deployed";
    delete next.pendingReason;
    return next;
  }

  const deployHash = deployment.deployHash ?? deployment.txHash ?? deployment.registrationId;
  const deployMeta = deployHash ? await fetchDeployMetadata(deployHash) : { account: undefined, failureMessage: undefined };

  const candidatePublicKeys = [
    deployment.deployerPublicKey,
    deployMeta.account,
    getOraclePublicKey(),
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

  if (!next.deployerPublicKey && deployMeta.account) {
    next.deployerPublicKey = deployMeta.account;
  }

  const assetId = deployment.assetId ?? (deployment.assetName ? makeAssetIdCasper(deployment.assetName) : undefined);
  if (assetId) {
    const namedKeyName = kind === "tokenCoupon"
      ? makeNamedKeyName("token_coupon", assetId)
      : makeNamedKeyName("identity_registry", assetId);
    for (const publicKey of candidatePublicKeys) {
      const contractHash = await fetchNamedKeyContractHash(publicKey, namedKeyName);
      if (contractHash) {
        next.contractHash = contractHash;
        next.contractAddress = next.contractAddress ?? contractHash;
        next.status = "Deployed";
        delete next.pendingReason;
        return next;
      }
    }
  }

  if (deployMeta.failureMessage) {
    next.status = "Failed";
    next.pendingReason = deployMeta.failureMessage;
  }

  return next;
}

async function reconcileDeployment(deployment: CasperDeploymentRecord) {
  const tokenDeployment = await reconcileContractDeployment(deployment, "tokenCoupon");

  if (!deployment.identityRegistry) {
    return tokenDeployment;
  }

  const identityRegistry = await reconcileContractDeployment(deployment.identityRegistry, "identityRegistry");
  if (JSON.stringify(identityRegistry) === JSON.stringify(deployment.identityRegistry)) {
    return tokenDeployment;
  }

  return {
    ...tokenDeployment,
    identityRegistry,
  };
}

function isStableContractDeployment(deployment: CasperContractDeploymentRecord | undefined) {
  if (!deployment) return true;
  const normalizedHash = normalizeContractHash(deployment.contractHash);
  return Boolean(normalizedHash && deployment.status === "Deployed");
}

function isStableDeployment(deployment: CasperDeploymentRecord) {
  return isStableContractDeployment(deployment)
    && isStableContractDeployment(deployment.identityRegistry);
}

export async function readDeploymentsWithReconciliation() {
  const current = readRawDeployments();
  let changed = false;
  const nextEntries = await Promise.all(Object.entries(current).map(async ([id, deployment]) => {
    if (isStableDeployment(deployment)) {
      return [id, deployment] as const;
    }
    const reconciled = await reconcileDeployment(deployment);
    const hasChanged = JSON.stringify(reconciled) !== JSON.stringify(deployment);
    if (hasChanged) changed = true;
    return [id, reconciled] as const;
  }));
  const reconciled = Object.fromEntries(nextEntries);
  if (changed) writeDeployments(reconciled);
  return reconciled;
}