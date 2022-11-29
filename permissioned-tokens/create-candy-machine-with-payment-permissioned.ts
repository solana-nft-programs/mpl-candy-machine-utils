import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  CONFIG_ARRAY_START,
  CONFIG_LINE_SIZE,
  createInitializeCandyMachineInstruction,
  createSetPermissionedSettingsInstruction,
  findPermissionedSettingsId,
  PROGRAM_ID,
} from "@cardinal/mpl-candy-machine-utils";
import { BN, utils } from "@project-serum/anchor";
import {
  findAta,
  withFindOrInitAssociatedTokenAccount,
} from "@cardinal/token-manager";
import { connectionFor } from "../connection";

// for environment variables
require("dotenv").config();

const candyMachineAuthorityKeypair = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.WALLET_KEYPAIR || "")
);
const PAYMENT_MINT = new PublicKey(
  "tttvgrrNcjVZJS33UAcwTNs46pAidgsAgJqGfYGdZtG"
);
const cluster = "devnet";
const connection = connectionFor(cluster);
const candyMachineKeypair = Keypair.generate();
const TRANSFER_AUTHORITY = new PublicKey("");
const ITEMS_AVAILABLE = 10;

const uuidFromConfigPubkey = (configAccount: PublicKey) => {
  return configAccount.toBase58().slice(0, 6);
};

const createCandyMachine = async () => {
  const candyMachineWalletId = await findAta(
    PAYMENT_MINT,
    candyMachineKeypair.publicKey,
    true
  );
  const initIx = createInitializeCandyMachineInstruction(
    {
      candyMachine: candyMachineKeypair.publicKey,
      wallet: candyMachineWalletId,
      authority: candyMachineAuthorityKeypair.publicKey,
      payer: candyMachineAuthorityKeypair.publicKey,
    },
    {
      data: {
        uuid: uuidFromConfigPubkey(candyMachineKeypair.publicKey),
        price: new BN(10),
        symbol: "SYM",
        sellerFeeBasisPoints: 500,
        maxSupply: new BN(2500),
        isMutable: true,
        retainAuthority: true,
        goLiveDate: new BN(Date.now() / 1000),
        endSettings: null,
        creators: [
          {
            address: candyMachineKeypair.publicKey,
            verified: true,
            share: 0,
          },
          {
            address: candyMachineAuthorityKeypair.publicKey,
            verified: false,
            share: 100,
          },
        ],
        hiddenSettings: null,
        whitelistMintSettings: null,
        itemsAvailable: new BN(ITEMS_AVAILABLE),
        gatekeeper: null,
      },
    }
  );
  const [permissionedSettingsId] = await findPermissionedSettingsId(
    candyMachineKeypair.publicKey
  );
  const permissionedInitIx = createSetPermissionedSettingsInstruction(
    {
      candyMachine: candyMachineKeypair.publicKey,
      authority: candyMachineAuthorityKeypair.publicKey,
      permissionedSettings: permissionedSettingsId,
      payer: candyMachineAuthorityKeypair.publicKey,
    },
    {
      creator: candyMachineAuthorityKeypair.publicKey,
      transferAuthority: TRANSFER_AUTHORITY,
    }
  );

  const tx = new Transaction();
  const size =
    CONFIG_ARRAY_START +
    4 +
    ITEMS_AVAILABLE * CONFIG_LINE_SIZE +
    8 +
    2 * (Math.floor(ITEMS_AVAILABLE / 8) + 1);
  const rent_exempt_lamports =
    await connection.getMinimumBalanceForRentExemption(size);

  await withFindOrInitAssociatedTokenAccount(
    tx,
    connection,
    PAYMENT_MINT,
    candyMachineKeypair.publicKey,
    candyMachineAuthorityKeypair.publicKey,
    true
  );
  tx.instructions = [
    ...tx.instructions,
    SystemProgram.createAccount({
      fromPubkey: candyMachineAuthorityKeypair.publicKey,
      newAccountPubkey: candyMachineKeypair.publicKey,
      space: size,
      lamports: rent_exempt_lamports,
      programId: PROGRAM_ID,
    }),
    {
      ...initIx,
      keys: [
        ...initIx.keys,
        {
          pubkey: PAYMENT_MINT,
          isSigner: false,
          isWritable: false,
        },
      ],
    },
    permissionedInitIx,
  ];
  tx.feePayer = candyMachineAuthorityKeypair.publicKey;
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  tx.sign(candyMachineAuthorityKeypair, candyMachineKeypair);
  const txid = await sendAndConfirmRawTransaction(connection, tx.serialize());
  console.log(
    `Succesfully created candy machine with address ${candyMachineKeypair.publicKey.toString()} https://explorer.solana.com/tx/${txid}`
  );
};

createCandyMachine();
