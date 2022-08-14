import {
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
import { remainingAccountsForLockup } from "@cardinal/mpl-candy-machine-utils";
import { utils } from "@project-serum/anchor";

const walletKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.AIRDROP_KEY || "")
);
const candyMachineId = new PublicKey("");
const collectionMintKeypair = Keypair.generate();

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

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
  const collectionMintMetadataId = await Metadata.getPDA(
    collectionMintKeypair.publicKey
  );
  const collectionMasterEditionId = await MasterEdition.getPDA(
    collectionMintKeypair.publicKey
  );

  const [collectionAuthorityRecordId] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      MetadataProgram.PUBKEY.toBuffer(),
      collectionMintKeypair.publicKey.toBuffer(),
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
    collectionMint: collectionMintKeypair.publicKey,
    collectionMasterEdition: collectionMasterEditionId,
    collectionMetadata: collectionMintMetadataId,
    authority: walletKeypair.publicKey,
    collectionAuthorityRecord: collectionAuthorityRecordId,
  });

  const instructions = [
    {
      ...mintIx,
      keys: [
        ...mintIx.keys,
        // remaining accounts for minting the token during execution
        {
          pubkey: tokenAccountToReceive,
          isSigner: false,
          isWritable: true,
        },
        // remaining accounts for locking
        ...(await remainingAccountsForLockup(
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
  await sendAndConfirmRawTransaction(connection, tx.serialize());
};

mintNft();
