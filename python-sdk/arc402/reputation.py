"""ReputationOracleClient — social trust signals for ARC-402."""

from __future__ import annotations

from typing import TYPE_CHECKING

from web3 import Web3

from .abis import ReputationOracle_ABI
from .types import ReputationSignal, ReputationSummary, SignalType

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class ReputationOracleClient:
    def __init__(self, address: str, w3: Web3, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: "Contract" = w3.eth.contract(address=Web3.to_checksum_address(address), abi=ReputationOracle_ABI)

    async def publish_signal(self, subject: str, signal_type: SignalType, capability_hash: str | bytes | None = None, reason: str = "") -> str:
        self._require_account()
        tx = self._contract.functions.publishSignal(
            Web3.to_checksum_address(subject),
            int(signal_type),
            self._to_bytes32(capability_hash),
            reason,
        ).build_transaction(self._tx_params())
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    def get_reputation(self, subject: str) -> ReputationSummary:
        return ReputationSummary.from_raw(self._contract.functions.getReputation(Web3.to_checksum_address(subject)).call())

    def get_capability_reputation(self, subject: str, capability_hash: str | bytes) -> int:
        return self._contract.functions.getCapabilityReputation(Web3.to_checksum_address(subject), self._to_bytes32(capability_hash)).call()

    def get_signal_count(self, subject: str) -> int:
        return self._contract.functions.getSignalCount(Web3.to_checksum_address(subject)).call()

    def get_signal(self, subject: str, index: int) -> ReputationSignal:
        return ReputationSignal.from_raw(self._contract.functions.getSignal(Web3.to_checksum_address(subject), index).call())

    def list_signals(self, subject: str) -> list[ReputationSignal]:
        return [self.get_signal(subject, i) for i in range(self.get_signal_count(subject))]

    def _require_account(self) -> None:
        if self._account is None:
            raise ValueError("ReputationOracleClient: an account is required for write methods. Pass account= when constructing the client.")

    def _to_bytes32(self, value: str | bytes | None) -> bytes:
        if value in (None, ""):
            return b"\x00" * 32
        if isinstance(value, bytes):
            return value.ljust(32, b"\x00")[:32]
        return bytes.fromhex(value.removeprefix("0x")).ljust(32, b"\x00")[:32]

    def _tx_params(self) -> dict:
        return {"from": self._account.address, "nonce": self._w3.eth.get_transaction_count(self._account.address), "gas": 300_000, "gasPrice": self._w3.eth.gas_price, "chainId": self._w3.eth.chain_id}

    async def _send(self, tx: dict) -> dict:
        signed = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._w3.eth.wait_for_transaction_receipt(tx_hash)
