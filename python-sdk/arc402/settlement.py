"""MultiAgentSettlement — proposes and executes agent-to-agent settlements."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from web3 import Web3

from .abis import SettlementCoordinator_ABI
from .exceptions import TransactionFailed
from .types import SettlementProposal

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class MultiAgentSettlement:
    def __init__(self, w3: Web3, address: str, account: "LocalAccount"):
        self._w3 = w3
        self._account = account
        self._contract: Contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=SettlementCoordinator_ABI,
        )

    async def propose(
        self,
        from_wallet: str,
        to_wallet: str,
        amount: int,
        intent_id: bytes,
        ttl_seconds: int = 3600,
    ) -> bytes:
        expires_at = int(time.time()) + ttl_seconds
        tx = self._contract.functions.propose(
            Web3.to_checksum_address(from_wallet),
            Web3.to_checksum_address(to_wallet),
            amount,
            intent_id,
            expires_at,
        ).build_transaction(self._tx_params())
        receipt = await self._send(tx)
        for log in receipt.get("logs", []):
            if len(log.get("topics", [])) > 0:
                return bytes(log["topics"][1])
        raise TransactionFailed("Could not extract proposal ID from receipt")

    async def accept(self, proposal_id: bytes) -> str:
        tx = self._contract.functions.accept(proposal_id).build_transaction(
            self._tx_params()
        )
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    async def reject(self, proposal_id: bytes, reason: str) -> str:
        tx = self._contract.functions.reject(
            proposal_id, reason
        ).build_transaction(self._tx_params())
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    async def execute(self, proposal_id: bytes, amount: int) -> str:
        tx = self._contract.functions.execute(proposal_id).build_transaction(
            {**self._tx_params(), "value": amount}
        )
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    async def get_proposal(self, proposal_id: bytes) -> SettlementProposal:
        from datetime import datetime

        raw = self._contract.functions.getProposal(proposal_id).call()
        return SettlementProposal(
            proposal_id=proposal_id.hex(),
            from_wallet=raw[0],
            to_wallet=raw[1],
            amount=raw[2],
            intent_id=raw[3].hex() if isinstance(raw[3], bytes) else raw[3],
            expires_at=datetime.fromtimestamp(raw[4]),
            status=raw[5],
            rejection_reason=raw[6],
        )

    def _tx_params(self) -> dict:
        return {
            "from": self._account.address,
            "nonce": self._w3.eth.get_transaction_count(self._account.address),
            "gas": 400_000,
            "gasPrice": self._w3.eth.gas_price,
            "chainId": self._w3.eth.chain_id,
        }

    async def _send(self, tx: dict) -> dict:
        signed = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._w3.eth.wait_for_transaction_receipt(tx_hash)
