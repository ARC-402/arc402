"""PolicyClient — interacts with the on-chain PolicyEngine contract."""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING

from web3 import Web3

from .abis import PolicyEngine_ABI
from .exceptions import PolicyViolation
from .types import PolicyConfig

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class PolicyClient:
    def __init__(self, w3: Web3, address: str, account: "LocalAccount"):
        self._w3 = w3
        self._account = account
        self._contract: Contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=PolicyEngine_ABI,
        )

    async def set_policy(self, wallet_address: str, config: dict[str, str | int]) -> str:
        policy = PolicyConfig.from_dict(config)
        policy_data = json.dumps(policy.categories).encode()
        policy_hash = bytes.fromhex(hashlib.sha256(policy_data).hexdigest())

        tx = self._contract.functions.setPolicy(
            policy_hash, policy_data
        ).build_transaction(
            self._tx_params()
        )
        receipt = await self._send(tx)

        for category, limit in policy.categories.items():
            tx2 = self._contract.functions.setCategoryLimitFor(
                Web3.to_checksum_address(wallet_address),
                category,
                limit,
            ).build_transaction(self._tx_params())
            await self._send(tx2)

        return receipt["transactionHash"].hex()

    async def validate_spend(
        self,
        wallet_address: str,
        category: str,
        amount: int,
        context_id: bytes,
    ) -> None:
        valid, reason = self._contract.functions.validateSpend(
            Web3.to_checksum_address(wallet_address),
            category,
            amount,
            context_id,
        ).call()
        if not valid:
            raise PolicyViolation(reason, category=category, amount=amount)

    async def get_category_limit(self, wallet_address: str, category: str) -> int:
        return self._contract.functions.categoryLimits(
            Web3.to_checksum_address(wallet_address), category
        ).call()

    def _tx_params(self) -> dict:
        return {
            "from": self._account.address,
            "nonce": self._w3.eth.get_transaction_count(self._account.address),
            "gas": 300_000,
            "gasPrice": self._w3.eth.gas_price,
            "chainId": self._w3.eth.chain_id,
        }

    async def _send(self, tx: dict) -> dict:
        signed = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._w3.eth.wait_for_transaction_receipt(tx_hash)
