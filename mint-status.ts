import { connectionFor } from "./connection";
import * as dotenv from "dotenv";
import { CandyMachine } from "@cardinal/mpl-candy-machine-utils";
import { PublicKey } from "@solana/web3.js";

dotenv.config();

const address = new PublicKey(process.env.CANDY_MACHINE_ID || "");
const cluster = "devnet";

export const getMintStatus = async () => {
  const connection = connectionFor(cluster);
  return CandyMachine.fromAccountAddress(connection, address);
};

getMintStatus()
  .then((d) => console.log(`Ouput: `, d))
  .catch((e) => console.log(`[error] ${e}`));
