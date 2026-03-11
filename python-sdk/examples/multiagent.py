"""
ARC-402 Example: Multi-Agent Settlement

Two agents negotiating and settling a payment via the
SettlementCoordinator contract.
"""

import asyncio
import os
import time

from arc402 import ARC402Wallet


async def agent_a_propose(wallet_a: ARC402Wallet, wallet_b_address: str, amount_wei: int) -> bytes:
    intent_id = await wallet_a.intent.attest(
        action="agent_payment",
        reason="Service rendered: data enrichment pipeline",
        recipient=wallet_b_address,
        amount=amount_wei,
    )

    proposal_id = await wallet_a.settlement.propose(
        from_wallet=wallet_a.address,
        to_wallet=wallet_b_address,
        amount=amount_wei,
        intent_id=intent_id,
        ttl_seconds=3600,
    )

    print(f"Agent A proposed settlement: {proposal_id.hex()[:16]}...")
    return proposal_id


async def agent_b_accept_and_execute(
    wallet_b: ARC402Wallet,
    proposal_id: bytes,
    amount_wei: int,
) -> str:
    proposal = await wallet_b.settlement.get_proposal(proposal_id)
    print(f"Agent B reviewing proposal: {proposal.amount} wei, status={proposal.status_name}")

    await wallet_b.settlement.accept(proposal_id)
    print("Agent B accepted proposal")

    tx_hash = await wallet_b.settlement.execute(proposal_id, amount_wei)
    print(f"Settlement executed: {tx_hash[:16]}...")
    return tx_hash


async def main() -> None:
    wallet_a = ARC402Wallet(
        address=os.environ["AGENT_A_WALLET"],
        private_key=os.environ["AGENT_A_KEY"],
        network="base-sepolia",
    )

    wallet_b = ARC402Wallet(
        address=os.environ["AGENT_B_WALLET"],
        private_key=os.environ["AGENT_B_KEY"],
        network="base-sepolia",
    )

    from web3 import Web3
    amount = Web3.to_wei("0.05", "ether")

    print("=== Multi-Agent Settlement Demo ===\n")

    async with wallet_a.context("agent_coordination", task_id="settlement-001"):
        proposal_id = await agent_a_propose(wallet_a, wallet_b.address, amount)

    tx_hash = await agent_b_accept_and_execute(wallet_b, proposal_id, amount)

    score_a = await wallet_a.trust_score()
    score_b = await wallet_b.trust_score()
    print(f"\nAgent A trust: {score_a.score} ({score_a.level})")
    print(f"Agent B trust: {score_b.score} ({score_b.level})")
    print(f"\nSettlement complete: {tx_hash}")


if __name__ == "__main__":
    asyncio.run(main())
