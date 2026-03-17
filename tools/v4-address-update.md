# WalletFactory v4 — Post-Deploy Address Update Guide

## Placeholders

```
WALLETFACTORY_V4=<address>
WALLETCODE_ORACLE_V4=<address>
```

Fill these in after deploy, then run the sed section below.

---

## Files to Update

### 1. `cli/src/config.ts` — line 80

```
walletFactoryAddress:          "0x974d2ae81cC9B4955e325890f4247AC76c92148D",   // WalletFactoryV3 — deployed 2026-03-17 (SSTORE2 split-chunk, correct bytecode)
```

**Change to:**
```
walletFactoryAddress:          "WALLETFACTORY_V4",   // WalletFactoryV4 — deployed <DATE>
```

**Note — base-sepolia testnet (line 107):**
```
walletFactoryAddress:         "0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87",
```
This is the sepolia testnet address (v1 factory). Update separately with the v4 testnet deployment address after E2E testing on Sepolia. **Do not reuse the mainnet address.**

---

### 2. `web/app/passkey-setup/PasskeySetupContent.tsx` — line 39

```
const WALLET_FACTORY = '0x974d2ae81cC9B4955e325890f4247AC76c92148D'
```

**Change to:**
```
const WALLET_FACTORY = 'WALLETFACTORY_V4'
```

---

### 3. `web/app/onboard/OnboardContent.tsx` — line 11

```
const WALLET_FACTORY  = '0x974d2ae81cC9B4955e325890f4247AC76c92148D'
```

**Change to:**
```
const WALLET_FACTORY  = 'WALLETFACTORY_V4'
```

---

### 4. `python-sdk/arc402/types.py` — line 35

```python
"wallet_factory": "0x974d2ae81cC9B4955e325890f4247AC76c92148D",   # WalletFactory v3 ← active (deployed 2026-03-17)
```

**Change to:**
```python
"wallet_factory": "WALLETFACTORY_V4",   # WalletFactory v4 ← active (deployed <DATE>)
```

**Note — base-sepolia (line 20):**
```python
"wallet_factory": "0x0000000000000000000000000000000000000000",
```
Currently a zero placeholder. Update with the v4 Sepolia address after testnet deploy.

---

### 5. `README.md` — lines 288–290 (mainnet contract table)

```
| WalletFactory v3 ← active | [`0x974d2ae81cC9B4955e325890f4247AC76c92148D`](https://basescan.org/address/0x974d2ae81cC9B4955e325890f4247AC76c92148D) |
| WalletFactory v3 chunk1 | [`0x113C2Fc826c6989D03110Ee6bB1357f526e8DE75`](https://basescan.org/address/0x113C2Fc826c6989D03110Ee6bB1357f526e8DE75) |
| WalletFactory v3 chunk2 | [`0x05CCeC2EbD262752cb033F5a73ca0601E7DbcEd8`](https://basescan.org/address/0x05CCeC2EbD262752cb033F5a73ca0601E7DbcEd8) |
```

**Change to:**
```
| WalletFactory v3 (frozen) | [`0x974d2ae81cC9B4955e325890f4247AC76c92148D`](https://basescan.org/address/0x974d2ae81cC9B4955e325890f4247AC76c92148D) |
| WalletFactory v4 ← active | [`WALLETFACTORY_V4`](https://basescan.org/address/WALLETFACTORY_V4) |
| WalletCodeOracle v4 | [`WALLETCODE_ORACLE_V4`](https://basescan.org/address/WALLETCODE_ORACLE_V4) |
```

---

### 6. `ENGINEERING-STATE.md` — v3 active line + contract table

Multiple places. After deploy, update:
- The "v3 (ERC-4337) — LIVE" section header (add "v4 — LIVE ON BASE MAINNET ✅" section)
- Contract table: mark WalletFactory v3 as `(frozen)`, add v4 row
- Next Steps: add v4 deploy to the ✅ list

Manual edit — too many narrative context-specific updates for sed. Do by hand.

---

### 7. `docs/networks.md` — testnet WalletFactory row (line 21)

```
| WalletFactory v1 | [`0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87`](https://sepolia.basescan.org/address/0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87) |
```

After Sepolia v4 testnet deploy, add a new row:
```
| WalletFactory v4 ← active | [`<SEPOLIA_V4_ADDR>`](https://sepolia.basescan.org/address/<SEPOLIA_V4_ADDR>) |
```

---

### 8. `skills/arc402-agent/SKILL.md`

No hardcoded factory addresses — no update needed.

---

## set-passkey CLI command — Verification

`arc402 wallet set-passkey` **exists and is wired** at `cli/src/commands/wallet.ts:1642`.

```
wallet.command("set-passkey <pubKeyX> <pubKeyY>")
  .description("Activate passkey (Face ID) on ARC402Wallet — takes P256 x/y coords...")
```

No changes needed here. The command operates on `walletContractAddress` from config (the deployed wallet instance), not the factory address.

---

## Testnet Note

The base-sepolia `walletFactoryAddress` in `cli/src/config.ts` is currently `0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87` (v1 factory). The python-sdk has `0x0000000000000000000000000000000000000000` (zero placeholder). **Deploy v4 to Sepolia first, test E2E, then update both before mainnet deploy.**

---

## Automated Update Script

After deploy, set the two env vars and run the sed commands:

```bash
# Set these after deploy:
export WALLETFACTORY_V4=0xNEW_FACTORY_ADDRESS_HERE
export WALLETCODE_ORACLE_V4=0xNEW_ORACLE_ADDRESS_HERE

# ── cli/src/config.ts ──────────────────────────────────────────────────────────
sed -i "s/0x974d2ae81cC9B4955e325890f4247AC76c92148D/${WALLETFACTORY_V4}/g" \
  cli/src/config.ts

# ── python-sdk ────────────────────────────────────────────────────────────────
sed -i "s/0x974d2ae81cC9B4955e325890f4247AC76c92148D/${WALLETFACTORY_V4}/g" \
  python-sdk/arc402/types.py

# ── web app ───────────────────────────────────────────────────────────────────
sed -i "s/0x974d2ae81cC9B4955e325890f4247AC76c92148D/${WALLETFACTORY_V4}/g" \
  web/app/passkey-setup/PasskeySetupContent.tsx \
  web/app/onboard/OnboardContent.tsx

# ── README.md ─────────────────────────────────────────────────────────────────
# Step 1: freeze v3 row (replace "← active" label)
sed -i "s/WalletFactory v3 ← active/WalletFactory v3 (frozen)/g" README.md

# Step 2: replace the v3 address in the frozen row
sed -i "s/0x974d2ae81cC9B4955e325890f4247AC76c92148D/${WALLETFACTORY_V4}/g" README.md
# NOTE: The above sed will also change the chunk rows if any have the same v3 address.
# README.md uses different addresses for chunk1/chunk2 — so the replacement is safe.
# After sed, manually add the WalletFactory v4 and WalletCodeOracle v4 rows to README.md.

# ── Verify ────────────────────────────────────────────────────────────────────
echo "Remaining v3 references:"
grep -r "0x974d2ae81cC9B4955e325890f4247AC76c92148D" \
  cli/src/config.ts python-sdk/arc402/types.py \
  web/app/passkey-setup/PasskeySetupContent.tsx \
  web/app/onboard/OnboardContent.tsx README.md
```

After running sed, **manually**:
1. Update `README.md` — add WalletFactory v4 and WalletCodeOracle v4 rows to the table
2. Update `ENGINEERING-STATE.md` — add v4 section, freeze v3 in contract table, tick off Next Step
3. Update `docs/networks.md` if a Sepolia v4 address exists
4. Rebuild the web app: `cd web && npm run build`
5. Commit: `git add -A && git commit -m 'deploy: WalletFactoryV4 mainnet — update addresses everywhere'`

---

*Prepared 2026-03-17 before v4 deploy. Fill WALLETFACTORY_V4 and WALLETCODE_ORACLE_V4 after deploy.*
