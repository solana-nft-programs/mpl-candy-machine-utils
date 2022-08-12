import {
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
import { programs } from "@cardinal/token-manager";
import { remainingAccountsForLockup } from "@cardinal/mpl-candy-machine-utils";
import { utils } from "@project-serum/anchor";

const walletKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.AIRDROP_KEY || "")
);
const candyMachineId = new PublicKey("");

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
  const [tokenManagerId] =
    await programs.tokenManager.pda.findTokenManagerAddress(
      nftToMintKeypair.publicKey
    );
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
        // remaining accounts for locking
        ...(await remainingAccountsForLockup(
          candyMachineId,
          nftToMintKeypair.publicKey,
          tokenAccountToReceive
        )),
      ],
    },
  ];
  const tx = new Transaction();
  tx.instructions = instructions;
  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(walletKeypair, nftToMintKeypair);
  await sendAndConfirmRawTransaction(connection, tx.serialize());
};

mintNft();
