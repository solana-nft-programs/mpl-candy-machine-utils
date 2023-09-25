# See notion for more in depth details

# Getting Started

All example scripts here can be run using `ts-node`

<strong>Prerequisites</strong>: Install ts-node, clone repo, install yarn dependencies

```
npm install -g ts-node
cd mpl-candy-machine-utils
yarn
```

## Setup

Create a .env file and specify

`WALLET_KEYPAIR=`

`PAYER_KEYPAIR=`

After creating a candy machine add

`CANDY_MACHINE_ID=`

## Example Scripts

`ts-node utils/create-candy-machine.ts`

- This is a simple script to create a candy machine without lockup settings. Step 3 can then be used to add lockup settings or modify it later on

`ts-node time-locked-tokens/create-candy-machine-with-lockup-settings.ts`

- This can be used to create a candy machine and set lockup settings on it in a single transaction

`ts-node time-locked-tokens/set-candy-machine-lockup-settings.ts`

- This can be used to set lockup settings on an existing candy machine

`tsnode mint.ts`

- This is an example minting script

`ts-node time-locked-tokens/mint-with-lockup-settings.ts`

- This is an example minting from a specified wallet and what extra accounts need to be added for lockup settings to work

`tsnode time-locked-tokens/mint-with-lockup-settings-and-collection-and-whitelist.ts`

- This is an example minting with lockup settings and collections and whitelist settings
- This also makes use of minting the token via CPI instead of via additional instructions in the transaction which is an optimization to reduce transaction size -- when this is done an extra account (recipientTokenAccount) must be added in remaining accounts AFTER whitelist/collection accounts and BEFORE lockup setttings accounts

# Freeze Authority Candy Machine

This document explains how to add “**LockupSettings**” to a candy machine.

LockupSettings allows for specifying a time-based lockup after mint. It supports duration, locking the token for X seconds after it is minted, or expiration allowing for a set datetime for all tokens to be released.

**There are a few use cases for this:**

1. Collections that do NOT want their collection being listed on marketplaces before the mint is over.
2. Long term lockups forcing projects to deliver on their promises before collecting royalties and have the project actually produce value for holders before they sell.
3. Having pre-sale and public-sale be released at the same time. This allows for public and WL minters to get equal chance at listing.

**PR to Metaplex:** https://github.com/metaplex-foundation/metaplex-program-library/pull/511/files

**Deployed Candy Machine:** [https://explorer.solana.com/address/ccmpgw68x3NJmNPePFrTm6TsKCEYUVhF8rEAVL9rSDd](https://explorer.solana.com/address/ccmpgw68x3NJmNPePFrTm6TsKCEYUVhF8rEAVL9rSDd)

## Implementing Freeze Authority CM:

High level steps

1. Create candy machine pointed to the new address — this is compatible with existing candy machine tooling just a new program address
2. Set lockup settings using the new “setLockupSettings” instruction
3. Add remaining accounts required during minting

### **Creating candy machine**

The candy machine can be created in the same exact way but the programId should be as specified above.

### **Script for adding lockup settings**

This script will create a lockup settings PDA and then set the lockup settings feature flag in the candy machine indicating that the additional accounts for lockup are required when minting. This can be placed into a ts file and run with `ts-node set-candy-machine-lockup-settings.ts`

```jsx
// set-candy-machine-lockup-settings.ts

import {
  Connection,
  Keypair,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";

const candyMachineAuthorityKeypair = Keypair.generate();
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);
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
```

### **Additional minting accounts**

```rust
// > Only needed if candy machine has lockup feature flag enabled
// lockup_settings
// token_manager
// token_manager_token_account
// mint_counter
// recipient_token_account
// time_invalidator
// time_invalidator_program
// token_manager_program
```

### **Appendix:**

**Reducing TX size limit**

To reduce transaction size limit, we have also made the optimization to allow for minting within the candy machine mint instruction via CPI instead of accounts up front. If you were building this mint transaction before you no longer have to put the mint instructions (createInitMintInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction) at the start and instead can just add `tokenAccountToReceive` account to remaining accounts. This account must be AFTER whitelist or collection accounts but BEFORE lockup settings accounts

**Requesting additional compute**

We have also allow-listed the compute program to allow launchpads to request additional compute during mint instruction. This allows for more complex operations to take place including both whitelist or gatekeeper AND lockup settings
