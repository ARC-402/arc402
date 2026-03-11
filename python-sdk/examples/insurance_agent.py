"""
ARC-402 Example: Insurance Claims Agent

An agent that processes claims and pays for medical record lookups,
governed by ARC-402 policy.
"""

import asyncio
import os

from arc402 import ARC402Wallet


async def setup_wallet() -> ARC402Wallet:
    wallet = ARC402Wallet(
        address=os.environ["AGENT_WALLET"],
        private_key=os.environ["AGENT_KEY"],
        network="base-sepolia",
    )

    await wallet.set_policy({
        "claims_processing": "0.1 ether",
        "research": "0.05 ether",
        "protocol_fee": "0.01 ether",
    })

    return wallet


async def process_claim(claim_id: str, patient_wallet: str) -> None:
    wallet = ARC402Wallet(
        address=os.environ["AGENT_WALLET"],
        private_key=os.environ["AGENT_KEY"],
        network="base-sepolia",
    )

    async with wallet.context("claims_processing", task_id=claim_id) as ctx:
        # Pay for medical records
        tx_hash = await wallet.spend(
            recipient=patient_wallet,
            amount="0.05 ether",
            category="claims_processing",
            reason=f"Medical records acquisition for claim {claim_id}",
        )
        print(f"Payment tx: {tx_hash}")

        # Pay protocol fee
        await wallet.spend(
            recipient="0x000000000000000000000000000000000000dEaD",
            amount="0.01 ether",
            category="protocol_fee",
            reason=f"ARC-402 protocol fee for claim {claim_id}",
        )

    score = await wallet.trust_score()
    print(f"Trust score after task: {score.score} ({score.level})")
    if score.next_level_at:
        print(f"Next level at: {score.next_level_at} points")


async def main() -> None:
    claims = [
        ("claim-4821", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        ("claim-4822", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"),
    ]

    for claim_id, patient_wallet in claims:
        print(f"\nProcessing {claim_id}...")
        await process_claim(claim_id, patient_wallet)

    # Show attestation history
    wallet = ARC402Wallet(
        address=os.environ["AGENT_WALLET"],
        private_key=os.environ["AGENT_KEY"],
        network="base-sepolia",
    )
    attestations = await wallet.attestations(limit=5)
    print(f"\nLast {len(attestations)} attestations:")
    for a in attestations:
        print(f"  [{a.timestamp}] {a.action} -> {a.recipient} ({a.amount} wei)")


if __name__ == "__main__":
    asyncio.run(main())
