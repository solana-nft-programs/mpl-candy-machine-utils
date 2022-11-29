import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  createSetCssSettingsInstruction,
  createSetPermissionedSettingsInstruction,
  findCcsSettingsId,
  findPermissionedSettingsId,
  LockupType,
} from "@cardinal/mpl-candy-machine-utils";
import { BN, utils } from "@project-serum/anchor";
import { findRulesetId } from "@cardinal/creator-standard";
import { connectionFor } from "../connection";

// for environment variables
require("dotenv").config();

const candyMachineAuthorityKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const cluster = "devnet";
const connection = connectionFor(cluster);
const candyMachineId = new PublicKey(process.env.CANDY_MACHINE_ID || "");

const addLockupSettings = async () => {
  const rulesetId = findRulesetId();
  const [cssSettingsId] = await findCcsSettingsId(candyMachineId);
  const tx = new Transaction();
  tx.add(
    createSetCssSettingsInstruction(
      {
        candyMachine: candyMachineId,
        authority: candyMachineAuthorityKeypair.publicKey,
        ccsSettings: cssSettingsId,
        payer: candyMachineAuthorityKeypair.publicKey,
      },
      {
        creator: new Keypair().publicKey,
        ruleset: rulesetId,
      }
    )
  );
  tx.feePayer = candyMachineAuthorityKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(candyMachineAuthorityKeypair);
  const txid = await sendAndConfirmRawTransaction(connection, tx.serialize());
  console.log(
    `Succesfully set permissioned settings for candy machine with address ${candyMachineId.toString()} https://explorer.solana.com/tx/${txid}?cluster=${cluster}`
  );
};

addLockupSettings();
