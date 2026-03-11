# arc402

ARC-402 is an open standard for governed wallets for autonomous AI agents — policy-bound, context-scoped, and trust-tracked on-chain. This SDK provides a Pythonic interface to deploy and operate ARC-402 wallets on Base.

## Installation

```bash
pip install arc402
```

## Quick Start

```python
import asyncio
import os
from arc402 import ARC402Wallet

async def main():
    # 1. Connect to an existing wallet
    wallet = ARC402Wallet(
        address=os.environ["AGENT_WALLET"],
        private_key=os.environ["AGENT_KEY"],
        network="base-sepolia",
    )

    # 2. Set spending policy
    await wallet.set_policy({
        "claims_processing": "0.1 ether",
        "research": "0.05 ether",
        "protocol_fee": "0.01 ether",
    })

    # 3. Open a context and spend within it
    async with wallet.context("claims_processing", task_id="claim-4821") as ctx:
        await wallet.spend(
            recipient="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            amount="0.05 ether",
            category="claims_processing",
            reason="Medical records for claim #4821 — injury assessment",
        )
    # Context auto-closes; trust score updates on exit

    # 4. Check trust score
    score = await wallet.trust_score()
    print(f"Trust score: {score.score} ({score.level})")
    # TrustScore(score=105, level='restricted', next_level_at=300)

asyncio.run(main())
```

## Deploy a new wallet

```python
wallet = await ARC402Wallet.deploy(
    private_key=os.environ["AGENT_KEY"],
    network="base-sepolia",
)
print(wallet.address)
```

## Agent-to-agent settlement

```python
from arc402 import ARC402Wallet
from web3 import Web3

wallet_a = ARC402Wallet(address="0x...", private_key="0x...", network="base-sepolia")
wallet_b = ARC402Wallet(address="0x...", private_key="0x...", network="base-sepolia")

intent_id = await wallet_a.intent.attest(
    action="data_service",
    reason="Enrichment pipeline output",
    recipient=wallet_b.address,
    amount=Web3.to_wei("0.05", "ether"),
)

proposal_id = await wallet_a.settlement.propose(
    from_wallet=wallet_a.address,
    to_wallet=wallet_b.address,
    amount=Web3.to_wei("0.05", "ether"),
    intent_id=intent_id,
)

await wallet_b.settlement.accept(proposal_id)
await wallet_b.settlement.execute(proposal_id, Web3.to_wei("0.05", "ether"))
```

## Links

- [GitHub](https://github.com/LegoGigaBrain/arc-402)
- [Specification](https://github.com/LegoGigaBrain/arc-402/spec)
