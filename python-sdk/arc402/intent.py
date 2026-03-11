"""IntentAttestation — creates and queries on-chain intent attestations."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from web3 import Web3

from .abis import IntentAttestation_ABI
from .exceptions import AttestationNotFound
from .types import AttestationRecord

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class IntentAttestation:
    def __init__(self, w3: Web3, address: str, account: "LocalAccount"):
        self._w3 = w3
        self._account = account
        self._contract: Contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=IntentAttestation_ABI,
        )

    async def attest(
        self,
        action: str,
        reason: str,
        recipient: str,
        amount: int,
    ) -> bytes:
        attestation_id = os.urandom(32)
        tx = self._contract.functions.attest(
            attestation_id,
            action,
            reason,
            Web3.to_checksum_address(recipient),
            amount,
        ).build_transaction(self._tx_params())
        await self._send(tx)
        return attestation_id

    async def get(self, attestation_id: bytes) -> AttestationRecord:
        raw = self._contract.functions.getAttestation(attestation_id).call()
        if raw[0] == b"\x00" * 32:
            raise AttestationNotFound(f"Attestation {attestation_id.hex()} not found")
        return AttestationRecord.from_raw(raw)

    async def verify(self, attestation_id: bytes, wallet_address: str) -> bool:
        return self._contract.functions.verify(
            attestation_id,
            Web3.to_checksum_address(wallet_address),
        ).call()

    async def history(self, wallet_address: str, limit: int = 10) -> list[AttestationRecord]:
        checksum = Web3.to_checksum_address(wallet_address)
        event_filter = self._contract.events.AttestationCreated.create_filter(
            from_block=0,
            argument_filters={"wallet": checksum},
        )
        events = event_filter.get_all_entries()
        records = []
        for ev in events[-limit:]:
            try:
                record = await self.get(ev["args"]["attestationId"])
                records.append(record)
            except AttestationNotFound:
                continue
        return records

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
