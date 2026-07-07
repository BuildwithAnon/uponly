# Building and Testing NOTCH

## Toolchain

- Rust (stable) with cargo
- Solana CLI 4.x with `cargo-build-sbf` (program builds against `solana-program` 2.1)
- A local `solana-test-validator` for the suite

## Build

```bash
# on-chain program -> program/target/deploy/notch.so (+ a program keypair)
cd program
cargo-build-sbf

# client + test binary
cd ../client
cargo build
```

Note: `cargo-build-sbf` generates `program/target/deploy/notch-keypair.json`. That keypair IS your program address on every cluster. Keep it out of the repo and back it up.

## Run the suite

```bash
solana-test-validator --reset --quiet &

# fund a payer and deploy
solana airdrop 1200 <payer-pubkey> --url http://127.0.0.1:8899
solana program deploy program/target/deploy/notch.so \
  --program-id program/target/deploy/notch-keypair.json \
  --keypair <payer.json> --url http://127.0.0.1:8899

RPC=http://127.0.0.1:8899 PROGRAM=<program-id> PAYER=<payer.json> \
  ./client/target/debug/curve-test
```

Expected: `46 passed, 0 failed`.

There are also native unit tests in the program crate (`cd program && cargo test`): fixed-point power accuracy, split-invariance of the mint (path-independence), monotone floor, and the max-loss bound.

## What the 46 tests prove

The test client re-implements the program's integer math exactly (same power law, same governor, same rounding), so most assertions are exact equality against on-chain results, not tolerances.

Setup and config:

- Initialize creates the curve PDA with the exact reference parameters
- re-Initialize is rejected
- the platform backing rule is enforced: backing below 82.5% or above 99% is rejected, so the governor is mandatory on every launch

Fee routing:

- the 1% buy fee lands in the hardcoded platform wallet on every launch
- the launcher receives nothing on buys, and a buy naming any other fee recipient is rejected
- the 1% sell fee lands with the sell creator

Buy path:

- exact token output for the 1st and 2nd buys (integer-identical to the mirror)
- the vault receives net + donation (0.99 per SOL), the platform receives exactly 1%
- exact price advance, price strictly monotone
- backing ratio at or above 93.5% after every buy
- a 210 SOL buy is allowed with exact power-law output: there is no artificial size cap
- a 100 SOL whale buy matches the mirror exactly under the governor and holds the backing ratio

Sell path:

- exact 94% payout, exact 1% creator fee
- units burned, vault debited by exactly seller + creator amounts
- the 5% floor share stays: NAV strictly rises on sells
- sells never move the curve price

Safety and guards:

- `min_out` slippage rejection on both sides
- overselling a balance is rejected
- a wrong creator account is rejected

Economic properties, measured live:

- an instant buy-then-dump round trip loses 14.7% at the reference 93.5% backing, inside the cap
- a large dump raises NAV, does not move the price, and the next buy prints HIGHER than the pre-dump price
- randomized buys and sells: price monotone, NAV monotone, backing ratio never below the line
- full exit of all holders: supply reaches zero with NO stranded backing (audit-fix regression), a restart buy works, the price never resets, and a revival buy cannot be round-tripped for a profit (audit-fix regression)

## The Python simulator

`sim/notch_sim.py` mirrors the same integer math and generated the datasets in `data/`. Use it to test any launch configuration before deploying:

```bash
python3 sim/notch_sim.py            # prints the reference tables
```

Edit the constants at the top (fees, backing, start price) to model your own launch.
