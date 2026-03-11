"""TrustClient — interacts with the on-chain TrustRegistry contract."""

from __future__ import annotations

from typing import TYPE_CHECKING

from web3 import Web3

from .abis import TrustRegistry_ABI
from .types import TrustScore

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class TrustClient:
    def __init__(self, w3: Web3, address: str, account: "LocalAccount"):
        self._w3 = w3
        self._account = account
        self._contract: Contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=TrustRegistry_ABI,
        )

    async def get_score(self, wallet_address: str) -> TrustScore:
        raw = self._contract.functions.getScore(
            Web3.to_checksum_address(wallet_address)
        ).call()
        return TrustScore.from_raw(raw)

    async def get_level(self, wallet_address: str) -> str:
        return self._contract.functions.getTrustLevel(
            Web3.to_checksum_address(wallet_address)
        ).call()

    async def record_success(self, wallet_address: str) -> str:
        tx = self._contract.functions.recordSuccess(
            Web3.to_checksum_address(wallet_address)
        ).build_transaction(self._tx_params())
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    async def record_anomaly(self, wallet_address: str) -> str:
        tx = self._contract.functions.recordAnomaly(
            Web3.to_checksum_address(wallet_address)
        ).build_transaction(self._tx_params())
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    def _tx_params(self) -> dict:
        return {
            "from": self._account.address,
            "nonce": self._w3.eth.get_transaction_count(self._account.address),
            "gas": 200_000,
            "gasPrice": self._w3.eth.gas_price,
            "chainId": self._w3.eth.chain_id,
        }

    async def _send(self, tx: dict) -> dict:
        signed = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._w3.eth.wait_for_transaction_receipt(tx_hash)
