import { keccak256, toHex, encodeAbiParameters, parseAbiParameters } from "viem";
import { publicClient, getWalletClient, COMPLIANCE_ORACLE_ABI, oracleAddress } from "./chain";

export function makeReportHash(reportJson: string): `0x${string}` {
  return keccak256(toHex(reportJson));
}

export async function submitScoreOnChain(
  assetId: `0x${string}`,
  score: number,
  reportJson: string
): Promise<`0x${string}`> {
  const reportHash = makeReportHash(reportJson);
  const walletClient = getWalletClient();

  const txHash = await walletClient.writeContract({
    address: oracleAddress(),
    abi: COMPLIANCE_ORACLE_ABI,
    functionName: "submitScore",
    args: [assetId, Math.round(score), reportHash],
  });

  return txHash;
}

export async function getScoreFromChain(assetId: `0x${string}`) {
  const data = await publicClient.readContract({
    address: oracleAddress(),
    abi: COMPLIANCE_ORACLE_ABI,
    functionName: "getScore",
    args: [assetId],
  });
  return { score: data[0], updatedAt: data[1], reportHash: data[2] };
}

export function makeAssetId(assetName: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string"), [assetName])
  );
}
