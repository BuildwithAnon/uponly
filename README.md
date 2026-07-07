# NOTCH

**A Solana launchpad for tokens with a capped downside. Every token's worst-case loss is bounded on-chain, and the floor only rises.**

Live on mainnet: program `DQf1BBhRNnhthJUmsCT6Rt2whodZyNLbsqKQ3kHYUU6N`. Site: https://notch.fund.

NOTCH tokens trade against their own on-chain vault instead of a DEX pool. Buys mint at the governor price and lift the floor; sells redeem against the vault at the floor and leave a fee behind that raises the floor for everyone still holding. A governor pins the price to the vault backing, so the worst possible round trip for any buyer is bounded by the code, not by trust.

## Properties

1. **Capped downside, enforced on-chain.** A governor holds the vault backing at a configured minimum fraction of the price. The worst case for any buyer (buy the top, dump instantly) is `1 - backing × 0.97 × 0.94` all-in. At the flagship 93.5% backing that is about 14.7%; the platform floor is 82.5% (about 24.8%).
2. **The price only rises.** Buys move it up on a curve; sells never touch it. There is no pool to dump into, so the price chart cannot print a red candle.
3. **Sells raise the floor.** 5% of every exit stays in the vault, lifting the floor (NAV) under every remaining holder.
4. **Path-independent.** Tokens mint by an exact power law, so splitting a buy into pieces gives the identical result. No one can farm extra tokens by chunking an order.
5. **Non-custodial by construction.** The program has no admin functions: no withdraw, no pause, no config change. Vault SOL leaves only through holder redemptions. The creator receives flow fees only and can never touch the vault.
6. **Permissionless.** One deployment serves unlimited launches (a curve PDA per mint). Anyone can create a token; there is no on-chain gate.

## How it works

```
BUY (3% fee)                              SELL (6% fee)
  1% -> platform (fixed fee wallet)         redeemed at NAV (vault / supply)
  2% -> vault (raises the floor)            94% -> seller
 97% -> mints tokens at NAV / backing        5% -> stays in vault (floor rises)
        (the governor price)                 1% -> creator
```

NAV (the floor) = vault balance / token supply. It rises on every buy (buyers mint above NAV) and every sell (the 5% stays). The curve price is pinned at `NAV / backing`, so it sits a fixed, small distance above the floor. Both numbers are monotone: they never go down, no matter what any holder does.

Minting is the exact power law `supply1 = supply0 × (Vf / V0)^backing`, computed in integer fixed-point (no floats). Because it is composable (buy(a) then buy(b) equals buy(a+b)), the amount minted for a given SOL is independent of how the order is split.

## Capped downside by backing

Each launch picks its own backing (higher = safer, less price movement). The worst-case round trip is a constant:

```
max loss = 1 - backing × (1 - 0.03 buy fee) × (1 - 0.06 sell fee)
         = 1 - backing × 0.9118
```

| backing | max loss (worst instant round trip) |
|---|---|
| 99% | ~9.7% |
| 93.5% (flagship) | ~14.7% |
| 90% | ~17.9% |
| 85% | ~22.5% |
| 82.5% (platform floor) | ~24.8% |

The platform enforces backing in `[82.5%, 99%]`, so no launch can exceed about 25% max loss. Backing is the only per-launch dial; the fees below are fixed for every token.

## Fees (fixed)

| side | total | split |
|---|---|---|
| Buy | 3% | 1% platform (`Bj6kYwqS7Le5SkwYepMTDUpDZNgmYTfXW9FPAvRq7vsY`, hardcoded) + 2% to the floor |
| Sell | 6% | 1% creator + 5% to the floor |

## Repository layout

```
program/   on-chain program (native Solana, no Anchor, ~600 lines)
client/    Rust client: instruction builders + the 46-test suite
sim/       Python simulator mirroring the exact integer math
data/      datasets generated from the exact math
docs/      TOKENOMICS.md, GUIDE.md, TESTING.md, DATASETS.md
```

## Build & test

```bash
cd program && cargo-build-sbf
solana-test-validator --reset &
solana program deploy program/target/deploy/notch.so --program-id <keypair>
cd client && cargo build
RPC=http://127.0.0.1:8899 PROGRAM=<program-id> PAYER=<payer.json> ./target/debug/curve-test
```

Expected: 46 PASS, 0 FAIL. Also `cd program && cargo test` for the native mint unit tests (fixed-point accuracy, path-independence, monotone floor, max-loss bound).

## Status

- **Live on mainnet** at `DQf1BBhRNnhthJUmsCT6Rt2whodZyNLbsqKQ3kHYUU6N` (upgradeable).
- Passes 46/46 on-chain tests plus 4 native unit tests, including a randomized fuzz that asserts price and floor never fall.
- **Not independently audited.** Reviewed and tested in-house only. The upgrade authority is currently retained, so the program is not yet immutable. Only commit what you can afford to lose.

## License

MIT
