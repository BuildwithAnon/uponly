// Upgrade the NOTCH program through the 2-of-2 Squads multisig.
// Phase 1: RPC=<url> PAYER=<signer.json> BUFFER=<buffer pubkey> PHASE=propose node squads-upgrade.mjs
//          creates the vault tx + proposal and approves the proposer's half, prints TXINDEX
// Phase 2 (after the co-signer approves in the Squads app):
//          RPC=<url> PAYER=<signer.json> TXINDEX=<n> PHASE=execute node squads-upgrade.mjs
// Prereqs: buffer written + buffer authority set to the vault PDA (see docs/UPGRADE-AUTHORITY.md).
import * as multisig from "@sqds/multisig";
import { Connection, Keypair, PublicKey, TransactionMessage, TransactionInstruction, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import fs from "fs";

const RPC = process.env.RPC || "https://api.mainnet-beta.solana.com";
const conn = new Connection(RPC, "confirmed");
const payerPath = process.env.PAYER || (() => { throw new Error("set PAYER=<path to member signer json>"); })();
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(payerPath, "utf8"))));

const multisigPda = new PublicKey("9Chz8q2Yhbz8z73uKYiARkFJjqKM49Ym8i1g4SsLYVWA");
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const PROGRAM = new PublicKey("DQf1BBhRNnhthJUmsCT6Rt2whodZyNLbsqKQ3kHYUU6N");
const PROGRAMDATA = new PublicKey("4FNrG7c5oMqFLew7JfNGaBThS7uFCcGYC5ZzgZmQwdpg");
const PHASE = process.env.PHASE || "propose";

if (PHASE === "propose") {
  const BUFFER = new PublicKey(process.env.BUFFER || (() => { throw new Error("set BUFFER=<buffer pubkey>"); })());
  // BPF upgradeable loader Upgrade (enum 3): [programdata w, program w, buffer w, spill w, rent, clock, authority s]
  const upgradeIx = new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: PROGRAMDATA, isSigner: false, isWritable: true },
      { pubkey: PROGRAM, isSigner: false, isWritable: true },
      { pubkey: BUFFER, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true }, // spill (buffer rent refund)
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: vaultPda, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([3, 0, 0, 0]),
  });

  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda);
  const txIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  const msg = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
    instructions: [upgradeIx],
  });

  let sig = await multisig.rpc.vaultTransactionCreate({
    connection: conn, feePayer: payer, multisigPda, transactionIndex: txIndex,
    creator: payer.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: msg,
  });
  await conn.confirmTransaction(sig, "confirmed"); console.log("vaultTransactionCreate:", sig);

  sig = await multisig.rpc.proposalCreate({ connection: conn, feePayer: payer, multisigPda, transactionIndex: txIndex, creator: payer });
  await conn.confirmTransaction(sig, "confirmed"); console.log("proposalCreate:", sig);

  sig = await multisig.rpc.proposalApprove({ connection: conn, feePayer: payer, multisigPda, transactionIndex: txIndex, member: payer });
  await conn.confirmTransaction(sig, "confirmed"); console.log("approve (proposer):", sig);

  console.log(`\nTXINDEX=${txIndex}`);
  console.log("NEXT: the co-signer approves the pending proposal at https://v4.squads.so,");
  console.log(`then: TXINDEX=${txIndex} PHASE=execute node squads-upgrade.mjs`);
} else if (PHASE === "execute") {
  const txIndex = BigInt(process.env.TXINDEX || (() => { throw new Error("set TXINDEX=<n> from the propose phase"); })());
  const sig = await multisig.rpc.vaultTransactionExecute({
    connection: conn, feePayer: payer, multisigPda, transactionIndex: txIndex, member: payer.publicKey, signers: [payer],
  });
  await conn.confirmTransaction(sig, "confirmed");
  console.log("UPGRADE EXECUTED:", sig);
} else {
  throw new Error("PHASE must be propose or execute");
}
