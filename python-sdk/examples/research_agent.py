"""
ARC-402 Example: Research Agent

An agent that pays for data access during research tasks,
governed by ARC-402 policy with automatic context tracking.
"""

import asyncio
import os

from arc402 import ARC402Wallet


DATA_PROVIDERS = {
    "arxiv": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "pubmed": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "semantic_scholar": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
}


async def research_topic(topic: str, query_id: str) -> list[str]:
    wallet = ARC402Wallet(
        address=os.environ["AGENT_WALLET"],
        private_key=os.environ["AGENT_KEY"],
        network="base-sepolia",
    )

    results = []

    async with wallet.context("research", task_id=query_id) as ctx:
        print(f"Context opened: {ctx.context_id_hex[:16]}...")

        for provider, provider_wallet in DATA_PROVIDERS.items():
            tx = await wallet.spend(
                recipient=provider_wallet,
                amount="0.01 ether",
                category="research",
                reason=f"Data query: '{topic}' via {provider} (query {query_id})",
            )
            print(f"  Paid {provider}: {tx[:16]}...")
            results.append(f"Results from {provider}")

    score = await wallet.trust_score()
    print(f"Trust score: {score.score} ({score.level})")
    return results


async def main() -> None:
    topics = [
        ("autonomous agent coordination", "q-001"),
        ("blockchain governance mechanisms", "q-002"),
    ]

    for topic, query_id in topics:
        print(f"\nResearching: {topic}")
        results = await research_topic(topic, query_id)
        print(f"Got {len(results)} result sets")


if __name__ == "__main__":
    asyncio.run(main())
