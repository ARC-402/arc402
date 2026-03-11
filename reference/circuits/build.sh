#!/bin/bash
# ARC-402 ZK Circuit Build Script
# Compiles Circom circuits → generates R1CS → generates proving/verification keys → generates Solidity verifiers
set -e

CIRCUITS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$CIRCUITS_DIR/../contracts"
BUILD_DIR="$CIRCUITS_DIR/build"
PTAU_DIR="$CIRCUITS_DIR/ptau"

mkdir -p "$BUILD_DIR" "$PTAU_DIR"

echo "=== ARC-402 ZK Build Pipeline ==="

# ─── 1. Install circomlib ──────────────────────────────────────────────────────
if [ ! -d "$CIRCUITS_DIR/node_modules/circomlib" ]; then
    echo "[1/6] Installing circomlib..."
    cd "$CIRCUITS_DIR" && npm install circomlib
else
    echo "[1/6] circomlib already installed"
fi

# ─── 2. Download Powers of Tau (phase 1, pre-computed, trusted) ───────────────
PTAU_FILE="$PTAU_DIR/pot12_final.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "[2/6] Downloading Powers of Tau (pot12, 2^12 = 4096 constraints max)..."
    curl -L -o "$PTAU_FILE" \
      "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau"
else
    echo "[2/6] Powers of Tau already present"
fi

# ─── 3. Compile circuits ──────────────────────────────────────────────────────
echo "[3/6] Compiling circuits..."

compile_circuit() {
    local NAME=$1
    local CIRCOM_FILE="$CIRCUITS_DIR/${NAME}.circom"
    local OUT_DIR="$BUILD_DIR/$NAME"
    mkdir -p "$OUT_DIR"

    echo "  Compiling $NAME..."
    circom "$CIRCOM_FILE" \
        --r1cs --wasm --sym \
        --output "$OUT_DIR" \
        --prime bn128

    echo "  ✓ $NAME compiled ($(du -sh $OUT_DIR/${NAME}.r1cs | cut -f1) R1CS)"
}

compile_circuit "TrustThreshold"
compile_circuit "SolvencyProof"
compile_circuit "CapabilityProof"

# ─── 4. Phase 2 trusted setup (circuit-specific) ─────────────────────────────
echo "[4/6] Running phase 2 setup..."

setup_circuit() {
    local NAME=$1
    local OUT_DIR="$BUILD_DIR/$NAME"
    local INTERMEDIATE="$OUT_DIR/${NAME}_0000.zkey"
    local FINAL="$OUT_DIR/${NAME}_final.zkey"

    snarkjs groth16 setup \
        "$OUT_DIR/${NAME}.r1cs" \
        "$PTAU_FILE" \
        "$INTERMEDIATE"

    # Contribute real system entropy from /dev/urandom.
    # Security model: single-party ceremony. As long as this entropy is deleted
    # (toxic waste), no one can forge proofs. For multi-party mainnet ceremony,
    # publish each contribution for independent verification (see spec/13-zk-extensions.md).
    local ENTROPY
    ENTROPY=$(openssl rand -hex 64)

    echo "$ENTROPY" | snarkjs zkey contribute \
        "$INTERMEDIATE" \
        "$FINAL" \
        --name="ARC-402 Ceremony $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        -v 2>/dev/null

    # Delete intermediate key (toxic waste) — do not distribute or commit _0000.zkey
    rm -f "$INTERMEDIATE"
    echo "  ✓ $NAME phase 2 complete (toxic waste destroyed)"
}

setup_circuit "TrustThreshold"
setup_circuit "SolvencyProof"
setup_circuit "CapabilityProof"

# ─── 5. Export verification keys ──────────────────────────────────────────────
echo "[5/6] Exporting verification keys..."

for NAME in TrustThreshold SolvencyProof CapabilityProof; do
    OUT_DIR="$BUILD_DIR/$NAME"
    snarkjs zkey export verificationkey \
        "$OUT_DIR/${NAME}_final.zkey" \
        "$OUT_DIR/verification_key.json"
    echo "  ✓ $NAME verification key exported"
done

# ─── 6. Generate Solidity verifier contracts ──────────────────────────────────
echo "[6/6] Generating Solidity verifiers..."

for NAME in TrustThreshold SolvencyProof CapabilityProof; do
    OUT_DIR="$BUILD_DIR/$NAME"
    snarkjs zkey export solidityverifier \
        "$OUT_DIR/${NAME}_final.zkey" \
        "$CONTRACTS_DIR/${NAME}Verifier.sol"
    echo "  ✓ ${NAME}Verifier.sol generated"
done

echo ""
echo "=== ZK Build Complete ==="
echo "Verifier contracts written to: $CONTRACTS_DIR/"
echo ""
echo "Next steps:"
echo "  1. Review generated verifier contracts"
echo "  2. Write wrapper contracts (ZKTrustGate.sol, ZKSolvencyGate.sol, ZKCapabilityGate.sol)"
echo "  3. Run forge build && forge test"
echo ""
echo "IMPORTANT: These keys use dev-entropy. For mainnet, run a proper"
echo "           multi-party trusted setup ceremony before deployment."
