import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  CandyMachine,
  createMintNftInstruction,
  createSetCollectionDuringMintInstruction,
  PROGRAM_ID,
  remainingAccountsForPermissioned,
} from "@cardinal/mpl-candy-machine-utils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Edition,
  MasterEdition,
  Metadata,
  MetadataProgram,
} from "@metaplex-foundation/mpl-token-metadata";
import { utils } from "@project-serum/anchor";

// for environment variables
require("dotenv").config();

const walletKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const candyMachineId = new PublicKey(
  process.env.PERMISSIONED_CANDY_MACHINE_ID || ""
);
const collectionMintId = new Keypair().publicKey;

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const mintNft = async () => {
  const [candyMachineCreatorId, candyMachineCreatorIdBump] =
    await PublicKey.findProgramAddress(
      [Buffer.from("candy_machine"), candyMachineId.toBuffer()],
      PROGRAM_ID
    );
  const candyMachine = await CandyMachine.fromAccountAddress(
    connection,
    candyMachineId
  );

  const nftToMintKeypair = Keypair.generate();
  const tokenAccountToReceive = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    nftToMintKeypair.publicKey,
    walletKeypair.publicKey,
    false
  );

  const remainingAccountsForPayment: AccountMeta[] = [];
  if (candyMachine.tokenMint) {
    const paymentTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      candyMachine.tokenMint,
      walletKeypair.publicKey,
      false
    );
    remainingAccountsForPayment.push(
      {
        pubkey: paymentTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: walletKeypair.publicKey,
        isSigner: false,
        isWritable: true,
      }
    );
  }

  const metadataId = await Metadata.getPDA(nftToMintKeypair.publicKey);
  const masterEditionId = await Edition.getPDA(nftToMintKeypair.publicKey);

  const mintIx = createMintNftInstruction(
    {
      candyMachine: candyMachineId,
      candyMachineCreator: candyMachineCreatorId,
      payer: walletKeypair.publicKey,
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
  const [collectionPdaId, _collectionPdaBump] =
    await PublicKey.findProgramAddress(
      [Buffer.from("collection"), candyMachineId.toBuffer()],
      PROGRAM_ID
    );
  const collectionMintMetadataId = await Metadata.getPDA(collectionMintId);
  const collectionMasterEditionId = await MasterEdition.getPDA(
    collectionMintId
  );

  const [collectionAuthorityRecordId] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      MetadataProgram.PUBKEY.toBuffer(),
      collectionMintId.toBuffer(),
      Buffer.from("collection_authority"),
      collectionPdaId.toBuffer(),
    ],
    MetadataProgram.PUBKEY
  );
  const setCollectionDuringMintIx = createSetCollectionDuringMintInstruction({
    candyMachine: candyMachineId,
    metadata: metadataId,
    payer: walletKeypair.publicKey,
    collectionPda: collectionPdaId,
    tokenMetadataProgram: MetadataProgram.PUBKEY,
    instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    collectionMint: collectionMintId,
    collectionMasterEdition: collectionMasterEditionId,
    collectionMetadata: collectionMintMetadataId,
    authority: candyMachine.authority,
    collectionAuthorityRecord: collectionAuthorityRecordId,
  });

  const instructions = [
    {
      ...mintIx,
      keys: [
        ...mintIx.keys.map((k) =>
          k.pubkey.equals(nftToMintKeypair.publicKey)
            ? { ...k, isSigner: true }
            : k
        ),
        // remaining accounts for paying in other toke
        ...remainingAccountsForPayment,
        // remaining accounts for minting the token during execution
        {
          pubkey: tokenAccountToReceive,
          isSigner: false,
          isWritable: true,
        },
        // remaining accounts for locking
        ...(await remainingAccountsForPermissioned(
          candyMachineId,
          nftToMintKeypair.publicKey,
          tokenAccountToReceive
        )),
      ],
    },
    setCollectionDuringMintIx,
  ];
  const tx = new Transaction();
  tx.instructions = instructions;
  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(walletKeypair, nftToMintKeypair);
  const txid = await sendAndConfirmRawTransaction(connection, tx.serialize(), {
    skipPreflight: true,
  });
  console.log(
    `Succesfully minted token ${nftToMintKeypair.publicKey.toString()} from candy machine with address ${candyMachineId.toString()} https://explorer.solana.com/tx/${txid}`
  );
};

mintNft();
