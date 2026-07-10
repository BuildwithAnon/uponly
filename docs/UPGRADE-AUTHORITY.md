# Upgrade authority: 2-of-2 Squads multisig

Since 2026-07-10 the NOTCH program's upgrade authority is a [Squads v4](https://squads.so) multisig vault. Every program upgrade, every transfer of the upgrade authority, and every change to the multisig itself (members, threshold) requires signatures from both members. No single party can modify or close the program.

## Addresses

| What | Address |
|---|---|
| Program | `DQf1BBhRNnhthJUmsCT6Rt2whodZyNLbsqKQ3kHYUU6N` |
| ProgramData | `4FNrG7c5oMqFLew7JfNGaBThS7uFCcGYC5ZzgZmQwdpg` |
| Squads multisig account | `9Chz8q2Yhbz8z73uKYiARkFJjqKM49Ym8i1g4SsLYVWA` (threshold 2 of 2) |
| Vault PDA (index 0) = upgrade authority | `Cw3BeNU8QTH5MhY12XqTincrMXjP59p8ALpzsLiBq8LU` |

Members, verifiable on chain in the multisig account:

1. `mCsdFy93ud2UQyW59asvXWhEsBY5WDFoMFQYBSsam3d` (program deployer)
2. `Bj6kYwqS7Le5SkwYepMTDUpDZNgmYTfXW9FPAvRq7vsY` (independent co-signer)

## Verify it yourself

- `solana program show DQf1BBhRNnhthJUmsCT6Rt2whodZyNLbsqKQ3kHYUU6N` prints the upgrade authority. It is the vault PDA above.
- The multisig account is owned by the Squads v4 program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`. Inspect it in any explorer, or at https://v4.squads.so.
- Authority handover proven by a multisig-executed transaction: `4G6GF92Z2KXLpKy6WdWtgxVewY3P1tEwRHxAe4XZH9vhr4ZPms5KEqZcUwHbL6nF9BTomYZEvvwf5EVZmKP44scq`
- Final 2-of-2 member configuration executed: `2mv1hTaL7LtA4qDdSQCwg5jzAhk4td4u5nrEB6WvHZkpxXDN8RwAwm4BCnJ7gndmPN9rrbFn99bsZneG7aDgX6Zx`

## What this guarantees

- Upgrading the program, closing it, or moving the upgrade authority all require the vault PDA to sign, and the vault only signs a transaction that both members have approved.
- Weakening the setup is equally gated: removing a member or lowering the threshold is itself a multisig transaction that needs both approvals.
- If the members ever lose the ability to co-sign, the program simply keeps running unchanged. The deployed code works permissionlessly, so trading and user funds are unaffected.

## Upgrade flow

Program upgrades are proposed and executed with the tooling in [`multisig/`](../multisig/):

```bash
# 1. write the new binary into a buffer (payer only, no authority involved)
solana program write-buffer notch.so -u <RPC> -k <deployer-signer.json>

# 2. hand the buffer to the vault
solana program set-buffer-authority <BUFFER> \
  --new-buffer-authority Cw3BeNU8QTH5MhY12XqTincrMXjP59p8ALpzsLiBq8LU \
  -u <RPC> -k <deployer-signer.json>

# 3. create the proposal and approve the first half (prints TXINDEX)
cd multisig && npm install
RPC=<RPC> PAYER=<deployer-signer.json> BUFFER=<BUFFER> PHASE=propose node squads-upgrade.mjs

# 4. the second member approves the pending proposal at https://v4.squads.so

# 5. execute
RPC=<RPC> PAYER=<deployer-signer.json> TXINDEX=<n> PHASE=execute node squads-upgrade.mjs

# 6. verify
solana program show DQf1BBhRNnhthJUmsCT6Rt2whodZyNLbsqKQ3kHYUU6N
```

Buffer rent is refunded to the payer when the upgrade executes.
