import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

export const mantleTestnet = defineChain({
  id: 5003,
  name: "Mantle Sepolia Testnet",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MANTLE_TESTNET_RPC ?? "https://rpc.sepolia.mantle.xyz"] },
  },
  blockExplorers: {
    default: { name: "MantleScan", url: "https://sepolia.mantlescan.xyz" },
  },
});

export const mantleMainnet = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MANTLE_MAINNET_RPC ?? "https://rpc.mantle.xyz"] },
  },
  blockExplorers: {
    default: { name: "MantleScan", url: "https://mantlescan.xyz" },
  },
});

const targetChain =
  process.env.NEXT_PUBLIC_CHAIN_ID === "5000" ? mantleMainnet : mantleTestnet;

export const publicClient = createPublicClient({
  chain: targetChain,
  transport: http(),
});

export function getWalletClient() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const account = privateKeyToAccount(`0x${pk}` as `0x${string}`);
  return createWalletClient({ account, chain: targetChain, transport: http() });
}

// ── Contract ABIs (minimal, for oracle interaction) ───────────────────────

export const COMPLIANCE_ORACLE_ABI = [
  {
    inputs: [
      { name: "assetId",    type: "bytes32" },
      { name: "score",      type: "uint8" },
      { name: "reportHash", type: "bytes32" },
    ],
    name: "submitScore",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "assetId", type: "bytes32" }],
    name: "getScore",
    outputs: [
      { name: "score",      type: "uint8" },
      { name: "updatedAt",  type: "uint64" },
      { name: "reportHash", type: "bytes32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId",   type: "bytes32" },
      { name: "threshold", type: "uint8" },
    ],
    name: "isCompliant",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const IDENTITY_REGISTRY_ABI = [
  {
    inputs: [
      { name: "investor",     type: "address" },
      { name: "isVerified",   type: "bool" },
      { name: "amlClear",     type: "bool" },
      { name: "jurisdiction", type: "bytes32" },
      { name: "kycExpiry",    type: "uint64" },
    ],
    name: "upsertInvestor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "investor", type: "address" }],
    name: "isEligible",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const HARBOUR_RWA_TOKEN_ABI = [
  {
    inputs: [
      { name: "assetId",               type: "bytes32" },
      { name: "assetType",             type: "uint8" },
      { name: "assetName",             type: "string" },
      { name: "maturityDate",          type: "uint256" },
      { name: "couponBps",             type: "uint256" },
      { name: "prospectusCommitment",  type: "bytes32" },
    ],
    name: "registerAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "assetId", type: "bytes32" }],
    name: "assets",
    outputs: [
      { name: "approved",               type: "bool" },
      { name: "assetType",              type: "uint8" },
      { name: "name",                   type: "string" },
      { name: "maturityDate",           type: "uint256" },
      { name: "couponBps",              type: "uint256" },
      { name: "prospectusCommitment",   type: "bytes32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "assetId", type: "bytes32" }],
    name: "AssetNotApproved",
    type: "error",
  },
  {
    inputs: [],
    name: "ComplianceCheckFailed",
    type: "error",
  },
  {
    inputs: [
      { name: "to",      type: "address" },
      { name: "amount",  type: "uint256" },
      { name: "assetId", type: "bytes32" },
    ],
    name: "mintForAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "couponToken",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "", type: "uint256" },
    ],
    name: "dividendSchedules",
    outputs: [
      { name: "paymentDate", type: "uint256" },
      { name: "amountPerToken", type: "uint256" },
      { name: "distributed", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "index", type: "uint256" },
      { name: "investor", type: "address" },
    ],
    name: "previewDividendClaim",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "index", type: "uint256" },
      { name: "investor", type: "address" },
    ],
    name: "hasClaimedDividend",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId",        type: "bytes32" },
      { name: "paymentDate",    type: "uint256" },
      { name: "amountPerToken", type: "uint256" },
    ],
    name: "scheduleDividend",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "index", type: "uint256" },
      { name: "totalAmount", type: "uint256" },
    ],
    name: "fundDividend",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "index", type: "uint256" },
    ],
    name: "claimDividend",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function oracleAddress(): Address {
  return (process.env.NEXT_PUBLIC_COMPLIANCE_ORACLE_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
}

export function registryAddress(): Address {
  return (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
}

export function tokenAddress(): Address {
  return (process.env.NEXT_PUBLIC_HARBOUR_RWA_TOKEN_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
}

export function moduleAddress(): Address {
  return (process.env.NEXT_PUBLIC_COMPLIANCE_MODULE_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
}

export function yieldAggregatorAddress(): Address {
  return (process.env.NEXT_PUBLIC_YIELD_AGGREGATOR_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
}

export const YIELD_AGGREGATOR_ABI = [
  {
    inputs: [
      { name: "user",       type: "address" },
      { name: "usdyPct",    type: "uint16"  },
      { name: "rationale",  type: "string"  },
    ],
    name: "autoRebalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "usdyBps", type: "uint16" },
      { name: "methBps", type: "uint16" },
    ],
    name: "setApyRates",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "tier", type: "uint8" },
    ],
    name: "setRiskTier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getYieldInfo",
    outputs: [
      { name: "usdyApy",    type: "uint16" },
      { name: "methApy",    type: "uint16" },
      { name: "lastUpdate", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getPortfolioYieldBps",
    outputs: [{ name: "weightedBps", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "lastRebalance",
    outputs: [
      { name: "timestamp",   type: "uint64" },
      { name: "usdyShares",  type: "uint256" },
      { name: "methShares",  type: "uint256" },
      { name: "usdyPct",     type: "uint16" },
      { name: "aiRationale", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "usdyDeposits",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "methDeposits",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const COMPLIANCE_MODULE_ABI = [
  {
    inputs: [
      { name: "to",      type: "address" },
      { name: "assetId", type: "bytes32" },
    ],
    name: "canMint",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to",   type: "address" },
    ],
    name: "canTransfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
