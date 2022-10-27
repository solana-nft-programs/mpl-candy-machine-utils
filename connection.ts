import type { Cluster } from "@solana/web3.js";
import { Connection } from "@solana/web3.js";

const networkURLs: { [key in Cluster | "mainnet" | "localnet"]: string } = {
  ["mainnet-beta"]:
    process.env.MAINNET_PRIMARY ?? "https://solana-api.projectserum.com",
  mainnet: process.env.MAINNET_PRIMARY ?? "https://solana-api.projectserum.com",
  devnet: "https://api.devnet.solana.com/",
  testnet: "https://api.testnet.solana.com/",
  localnet: "http://localhost:8899/",
};

export const connectionFor = (
  cluster: Cluster | "mainnet" | "localnet",
  defaultCluster = "mainnet"
) => {
  return new Connection(
    process.env.RPC_URL || networkURLs[cluster || defaultCluster],
    "recent"
  );
};
