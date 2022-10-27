import * as dotenv from "dotenv";
import {
  ComputeBudgetProgram,
  AccountMeta,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  Transaction,
  Cluster,
} from "@solana/web3.js";
import {
  createMintNftInstruction,
  PROGRAM_ID,
  CandyMachine,
  findLockupSettingsId,
} from "@cardinal/mpl-candy-machine-utils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Edition,
  Metadata,
  MetadataProgram,
} from "@metaplex-foundation/mpl-token-metadata";
import { remainingAccountsForLockup } from "@cardinal/mpl-candy-machine-utils";
import { findAta } from "@cardinal/token-manager";
import { Wallet } from "@project-serum/anchor";
import { connectionFor } from "./connection";
import { keypairFrom } from "./utils";

dotenv.config();

const walletKeypair = keypairFrom(process.env.WALLET_KEYPAIR, "Wallet");
const payerKeypair = process.env.PAYER_KEYPAIR
  ? keypairFrom(process.env.PAYER_KEYPAIR, "Payer")
  : walletKeypair;
const candyMachineId = new PublicKey(process.env.CANDY_MACHINE_ID || "");
const cluster = "devnet";

export const mint = async (
  wallet: Wallet,
  candyMachineId: PublicKey,
  cluster: Cluster | "mainnet" | "localnet",
  payerWallet?: Wallet
) => {
  const connection = connectionFor(cluster);
  const payerId = payerWallet?.publicKey ?? wallet.publicKey;

  const nftToMintKeypair = Keypair.generate();
  const tokenAccountToReceive = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    nftToMintKeypair.publicKey,
    wallet.publicKey,
    false
  );

  const metadataId = await Metadata.getPDA(nftToMintKeypair.publicKey);
  const masterEditionId = await Edition.getPDA(nftToMintKeypair.publicKey);
  const [candyMachineCreatorId, candyMachineCreatorIdBump] =
    await PublicKey.findProgramAddress(
      [Buffer.from("candy_machine"), candyMachineId.toBuffer()],
      PROGRAM_ID
    );

  const candyMachine = await CandyMachine.fromAccountAddress(
    connection,
    candyMachineId
  );
  console.log(`> Creating mint instruction`);
  const mintIx = createMintNftInstruction(
    {
      candyMachine: candyMachineId,
      candyMachineCreator: candyMachineCreatorId,
      payer: payerId,
      wallet: candyMachine.wallet,
      metadata: metadataId,
      mint: nftToMintKeypair.publicKey,
      mintAuthority: wallet.publicKey,
      updateAuthority: wallet.publicKey,
      masterEdition: masterEditionId,
      tokenMetadataProgram: MetadataProgram.PUBKEY,
      clock: SYSVAR_CLOCK_PUBKEY,
      recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
    },
    {
      creatorBump: candyMachineCreatorIdBump,
    }
  );
  const remainingAccounts: AccountMeta[] = [];

  // Payment
  if (candyMachine.tokenMint) {
    console.log(`> Add payment accounts`);
    const payerTokenAccount = await findAta(
      candyMachine.tokenMint,
      payerId,
      true
    );
    remainingAccounts.push(
      {
        pubkey: payerTokenAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: payerId,
        isWritable: true,
        isSigner: false,
      }
    );
  }

  // Inline minting
  console.log(`> Adding mint accounts`);
  remainingAccounts.push({
    pubkey: tokenAccountToReceive,
    isSigner: false,
    isWritable: true,
  });

  // Lockup settings
  const [lockupSettingsId] = await findLockupSettingsId(candyMachineId);
  const lockupSettings = await connection.getAccountInfo(lockupSettingsId);
  if (lockupSettings) {
    console.log(`> Adding lockup settings accounts`);
    remainingAccounts.push(
      ...(await remainingAccountsForLockup(
        candyMachineId,
        nftToMintKeypair.publicKey,
        tokenAccountToReceive
      ))
    );
  }

  console.log(
    mintIx.keys.map((k) => k.pubkey.toString()),
    remainingAccounts.map((r) => r.pubkey.toString())
  );

  const instructions = [
    ComputeBudgetProgram.requestUnits({
      units: 400000,
      additionalFee: 0,
    }),
    {
      ...mintIx,
      keys: [
        ...mintIx.keys.map((k) =>
          k.pubkey.equals(nftToMintKeypair.publicKey)
            ? { ...k, isSigner: true }
            : k
        ),
        // remaining accounts for locking
        ...remainingAccounts,
      ],
    },
  ];
  const tx = new Transaction();
  tx.instructions = instructions;
  tx.feePayer = payerId;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  await wallet.signTransaction(tx);
  if (payerWallet) {
    await payerWallet.signTransaction(tx);
  }
  await tx.partialSign(nftToMintKeypair);
  const txid = await sendAndConfirmRawTransaction(connection, tx.serialize());
  console.log(
    `Succesfully minted token ${nftToMintKeypair.publicKey.toString()} from candy machine with address ${candyMachineId.toString()} https://explorer.solana.com/tx/${txid}?cluster=${cluster}`
  );
  return txid;
};

const main = async () => {
  await mint(
    new Wallet(walletKeypair),
    candyMachineId,
    cluster,
    new Wallet(payerKeypair)
  ).then((d) => console.log(`Ouput: `, d));
};

main().catch((e) => console.log(`[error]`, e));
