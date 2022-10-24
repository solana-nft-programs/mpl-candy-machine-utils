import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  createMintNftInstruction,
  PROGRAM_ID,
  CandyMachine,
  remainingAccountsForPermissioned,
  findPermissionedSettingsId,
} from "@cardinal/mpl-candy-machine-utils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Edition,
  Metadata,
  MetadataProgram,
} from "@metaplex-foundation/mpl-token-metadata";
import { utils } from "@project-serum/anchor";
import { findAta } from "@cardinal/token-manager";

// for environment variables
require("dotenv").config();

const walletKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const payerKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const candyMachineId = new PublicKey(
  process.env.PERMISSIONED_CANDY_MACHINE_ID || ""
);

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const mintNft = async () => {
  const nftToMintKeypair = Keypair.generate();
  const tokenAccountToReceive = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    nftToMintKeypair.publicKey,
    walletKeypair.publicKey,
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
  const mintIx = createMintNftInstruction(
    {
      candyMachine: candyMachineId,
      candyMachineCreator: candyMachineCreatorId,
      payer: payerKeypair.publicKey,
      wallet: candyMachine.wallet,
      metadata: metadataId,
      mint: nftToMintKeypair.publicKey,
      mintAuthority: walletKeypair.publicKey,
      updateAuthority: walletKeypair.publicKey,
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

  // add payment mint
  if (candyMachine.tokenMint) {
    const payerTokenAccount = await findAta(
      candyMachine.tokenMint,
      payerKeypair.publicKey,
      true
    );
    remainingAccounts.push(
      {
        pubkey: payerTokenAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: payerKeypair.publicKey,
        isWritable: true,
        isSigner: false,
      }
    );
  }

  // add permissioned settings
  const [permissionedSettingsId] = await findPermissionedSettingsId(
    candyMachineId
  );
  const permissionedSettings = await connection.getAccountInfo(
    permissionedSettingsId
  );
  if (permissionedSettings) {
    remainingAccounts.push(
      ...(await remainingAccountsForPermissioned(
        candyMachineId,
        nftToMintKeypair.publicKey,
        tokenAccountToReceive
      ))
    );
  }

  const instructions = [
    SystemProgram.createAccount({
      fromPubkey: walletKeypair.publicKey,
      newAccountPubkey: nftToMintKeypair.publicKey,
      space: MintLayout.span,
      lamports: await connection.getMinimumBalanceForRentExemption(
        MintLayout.span
      ),
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      nftToMintKeypair.publicKey,
      0,
      walletKeypair.publicKey,
      walletKeypair.publicKey
    ),
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      nftToMintKeypair.publicKey,
      tokenAccountToReceive,
      walletKeypair.publicKey,
      walletKeypair.publicKey
    ),
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      nftToMintKeypair.publicKey,
      tokenAccountToReceive,
      walletKeypair.publicKey,
      [],
      1
    ),
    {
      ...mintIx,
      keys: [
        ...mintIx.keys,
        // remaining accounts for permissioned
        ...remainingAccounts,
      ],
    },
  ];
  const tx = new Transaction();
  tx.instructions = instructions;
  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(walletKeypair, nftToMintKeypair, payerKeypair);
  const txid = await sendAndConfirmRawTransaction(connection, tx.serialize(), {
    skipPreflight: true,
  });
  console.log(
    `Succesfully minted token ${nftToMintKeypair.publicKey.toString()} from candy machine with address ${candyMachineId.toString()} https://explorer.solana.com/tx/${txid}`
  );
};

mintNft();
