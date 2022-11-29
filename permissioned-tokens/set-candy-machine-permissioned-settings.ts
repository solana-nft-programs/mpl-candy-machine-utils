import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  createSetPermissionedSettingsInstruction,
  findPermissionedSettingsId,
  LockupType,
} from "@cardinal/mpl-candy-machine-utils";
import { BN, utils } from "@project-serum/anchor";
import { connectionFor } from "../connection";

// for environment variables
require("dotenv").config();

const candyMachineAuthorityKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const cluster = "devnet";
const connection = connectionFor(cluster);
const candyMachineId = new PublicKey(
  process.env.PERMISSIONED_CANDY_MACHINE_ID || ""
);

const addLockupSettings = async () => {
  const [permissionedSettingsId] = await findPermissionedSettingsId(
    candyMachineId
  );
  const tx = new Transaction();
  tx.add(
    createSetPermissionedSettingsInstruction(
      {
        candyMachine: candyMachineId,
        authority: candyMachineAuthorityKeypair.publicKey,
        permissionedSettings: permissionedSettingsId,
        payer: candyMachineAuthorityKeypair.publicKey,
      },
      {
        creator: new Keypair().publicKey,
        transferAuthority: null,
      }
    )
  );
  tx.feePayer = candyMachineAuthorityKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(candyMachineAuthorityKeypair);
  const txid = await sendAndConfirmRawTransaction(connection, tx.serialize());
  console.log(
    `Succesfully set permissioned settings for candy machine with address ${candyMachineId.toString()} https://explorer.solana.com/tx/${txid}`
  );
};

addLockupSettings();
