import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { mantle, mantleSepoliaTestnet } from "viem/chains";
import { createConfig, http } from "wagmi";

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "5003");
export const targetChain = chainId === 5000 ? mantle : mantleSepoliaTestnet;
export const targetChainId = chainId;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Browser Wallet",
      wallets: [
        injectedWallet,
      ],
    },
  ],
  {
    appName: "HarbourRWA",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "disabled",
  },
);

export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors,
  transports: {
    [mantle.id]: http(process.env.MANTLE_MAINNET_RPC ?? "https://rpc.mantle.xyz"),
    [mantleSepoliaTestnet.id]: http(process.env.MANTLE_TESTNET_RPC ?? "https://rpc.sepolia.mantle.xyz"),
  },
  ssr: true,
});
