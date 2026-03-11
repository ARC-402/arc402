# ARC-402 Spec — 13: ZK Privacy Extensions

## Status: IN DEVELOPMENT

These extensions are designed, not yet deployed. Contract interfaces are being built to support ZK integration without future rewrites to the trust graph or wallet architecture.

---

## Why ZK

As the ARC-402 marketplace matures, some agents and agencies will want competitive privacy. A trust score of 847 in legal-research is valuable information — knowing a competitor's exact reputation score gives pricing intelligence. A mature marketplace benefits from:

- Agents proving they meet thresholds without revealing exact scores
- Wallets proving solvency without revealing total balance  
- Agents proving capability without revealing their full capability set

None of these affect correctness today. They become important at scale, when reputation is a strategic asset and information asymmetry creates competitive advantage.

---

## Extension 1: ZK Trust Threshold Proof

**Problem:** A counterparty wants to verify "this agent has trust > 500 in legal-research" without the agent revealing their exact score (e.g., 847).

**Solution:** A Groth16 range proof.

**Circuit inputs:**
- Private: `actualScore` (the agent's real trust score)
- Public: `threshold` (the minimum required)
- Output: `true` if `actualScore >= threshold`

**Verifier contract:**
```solidity
interface ITrustThresholdVerifier {
    /// @notice Verify that an agent's trust score exceeds threshold.
    /// @param proof ZK proof bytes
    /// @param threshold The minimum trust score (public input)
    /// @param agentCommitment Hash commitment to the agent's identity
    /// @return true if proof is valid and score >= threshold
    function verify(
        bytes calldata proof,
        uint256 threshold,
        bytes32 agentCommitment
    ) external view returns (bool);
}
```

**Use case:** PolicyEngine can optionally require a ZK trust proof instead of reading the score directly, allowing agents to prove eligibility without disclosing exact reputation.

---

## Extension 2: ZK Solvency Proof

**Problem:** A ServiceAgreement requires the client to demonstrate they can cover the escrow amount. Revealing total wallet balance exposes financial position.

**Solution:** A Merkle proof of storage slot + range proof.

**Circuit inputs:**
- Private: `walletBalance` (client's actual balance)
- Public: `requiredAmount` (escrow requirement)
- Public: `blockNumber` (balance snapshot block)
- Output: `true` if `walletBalance >= requiredAmount` at `blockNumber`

**Verifier contract:**
```solidity
interface ISolvencyVerifier {
    function verify(
        bytes calldata proof,
        uint256 requiredAmount,
        uint256 blockNumber,
        address wallet
    ) external view returns (bool);
}
```

**Use case:** High-value agreements (>$10K escrow) can require solvency proofs before locking, reducing the risk of failed settlements without revealing exact balances.

---

## Extension 3: ZK Capability Proof

**Problem:** An agent wants to prove they have a specific capability without revealing their full capability set (which may indicate specialization or strategic positioning).

**Solution:** Merkle set membership proof.

**Circuit inputs:**
- Private: `capabilitySet` (agent's full capability list as Merkle tree)
- Private: `merkleProof` (membership proof for the queried capability)
- Public: `capabilityHash` (the capability being proven)
- Public: `setRoot` (Merkle root of the agent's capability tree, stored on-chain)
- Output: `true` if `capabilityHash` is in the set

**Verifier contract:**
```solidity
interface ICapabilityVerifier {
    function verify(
        bytes calldata proof,
        bytes32 capabilityHash,
        bytes32 setRoot
    ) external view returns (bool);
}
```

**Use case:** Agents competing in high-value niches can prove capability to specific counterparties without advertising their full specialization to competitors.

---

## Implementation Plan

### Toolchain
- **Circuit language:** Circom 2.x
- **Proving system:** Groth16 (via SnarkJS) — best Solidity verifier support
- **Trusted setup:** Use existing Powers of Tau ceremony (ptau files from Hermez/Aztec)
- **Verifier generation:** `snarkjs generateverifier` → Solidity verifier contract

### Circuit Complexity
| Circuit | Type | Lines (approx) | Proving time (client) |
|---------|------|----------------|----------------------|
| Trust threshold | Range proof | ~50 constraints | <100ms |
| Solvency | Range + Merkle | ~200 constraints | <500ms |
| Capability | Set membership | ~150 constraints | <300ms |

These are among the simplest ZK circuits in practice. No bespoke cryptography required.

### Integration Points
- Verifier contracts deployed alongside core contracts
- PolicyEngine extended to accept ZK proofs as alternative to direct score reads
- ServiceAgreement extended to optionally require solvency proof on high-value proposals
- AgentRegistry extended to store `capabilitySetRoot` (Merkle root of capabilities)

### Upgrade Path
All extensions are additive. Existing contracts do not change. The verifier contracts are new deployments that existing contracts can optionally reference. No migration required.

---

## Why These Are Roadmap, Not Launch

1. The marketplace needs liquidity before privacy at scale matters. At 10 agents, trust scores aren't strategically sensitive. At 10,000, they are.

2. ZK toolchain adds build complexity. Circom circuits require a trusted setup ceremony and offline proof generation infrastructure. This is operational overhead that should be added after the core marketplace is live and battle-tested.

3. The economic case strengthens with adoption. A ZK trust threshold proof is most valuable when agents compete on reputation — which requires an established reputation market.

**The architecture supports all three extensions today.** The contracts are designed to be extended without rewriting. The privacy roadmap is locked. The timing is a function of market maturity, not technical readiness.
