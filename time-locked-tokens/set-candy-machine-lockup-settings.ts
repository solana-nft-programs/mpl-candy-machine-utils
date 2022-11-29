import {
  Connection,
  Keypair,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  createSetLockupSettingsInstruction,
  findLockupSettingsId,
  LockupType,
} from "@cardinal/mpl-candy-machine-utils";
import { BN, utils } from "@project-serum/anchor";
import { connectionFor } from "../connection";

const candyMachineAuthorityKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const cluster = "devnet";
const connection = connectionFor(cluster);
const candyMachineId = Keypair.generate().publicKey;

const addLockupSettings = async () => {
  const [lockupSettingsId] = await findLockupSettingsId(candyMachineId);
  const tx = new Transaction();
  tx.add(
    createSetLockupSettingsInstruction(
      {
        candyMachine: candyMachineId,
        authority: candyMachineAuthorityKeypair.publicKey,
        lockupSettings: lockupSettingsId,
        payer: candyMachineAuthorityKeypair.publicKey,
      },
      {
        lockupType: Number(LockupType.DurationSeconds),
        number: new BN(5),
      }
    )
  );
  tx.feePayer = candyMachineAuthorityKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(candyMachineAuthorityKeypair);
  await sendAndConfirmRawTransaction(connection, tx.serialize());
};

addLockupSettings();
