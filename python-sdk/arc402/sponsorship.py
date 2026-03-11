"""SponsorshipAttestationClient — sponsorship and identity tier attestations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from web3 import Web3

from .abis import SponsorshipAttestation_ABI
from .types import IdentityTier, SponsorshipAttestationRecord

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class SponsorshipAttestationClient:
    def __init__(self, address: str, w3: Web3, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: "Contract" = w3.eth.contract(address=Web3.to_checksum_address(address), abi=SponsorshipAttestation_ABI)

    async def publish(self, agent: str, expires_at: int = 0) -> str:
        return await self._write_for_id("publish", Web3.to_checksum_address(agent), expires_at)

    async def publish_with_tier(self, agent: str, expires_at: int, tier: IdentityTier, evidence_uri: str = "") -> str:
        return await self._write_for_id("publishWithTier", Web3.to_checksum_address(agent), expires_at, int(tier), evidence_uri)

    async def revoke(self, attestation_id: str | bytes) -> str:
        self._require_account()
        receipt = await self._send(self._contract.functions.revoke(self._to_bytes32(attestation_id)).build_transaction(self._tx_params()))
        return receipt["transactionHash"].hex()

    def is_active(self, attestation_id: str | bytes) -> bool:
        return self._contract.functions.isActive(self._to_bytes32(attestation_id)).call()

    def get_active_attestation(self, sponsor: str, agent: str) -> str:
        return self._contract.functions.getActiveAttestation(Web3.to_checksum_address(sponsor), Web3.to_checksum_address(agent)).call().hex()

    def get_attestation(self, attestation_id: str | bytes) -> SponsorshipAttestationRecord:
        return SponsorshipAttestationRecord.from_raw(self._contract.functions.getAttestation(self._to_bytes32(attestation_id)).call())

    def get_sponsor_attestations(self, sponsor: str) -> list[str]:
        return [value.hex() for value in self._contract.functions.getSponsorAttestations(Web3.to_checksum_address(sponsor)).call()]

    def get_agent_attestations(self, agent: str) -> list[str]:
        return [value.hex() for value in self._contract.functions.getAgentAttestations(Web3.to_checksum_address(agent)).call()]

    def active_sponsor_count(self, sponsor: str) -> int:
        return self._contract.functions.activeSponsorCount(Web3.to_checksum_address(sponsor)).call()

    def get_highest_tier(self, agent: str) -> IdentityTier:
        return IdentityTier(self._contract.functions.getHighestTier(Web3.to_checksum_address(agent)).call())

    def is_verified(self, agent: str) -> bool:
        return self.get_highest_tier(agent) >= IdentityTier.VERIFIED_PROVIDER

    async def _write_for_id(self, fn_name: str, *args) -> str:
        self._require_account()
        receipt = await self._send(getattr(self._contract.functions, fn_name)(*args).build_transaction(self._tx_params()))
        return self._extract_id(receipt)

    def _extract_id(self, receipt: dict) -> str:
        try:
            events = self._contract.events.AttestationPublished().process_receipt(receipt)
            if events:
                return events[0]["args"]["attestationId"].hex()
        except Exception:
            pass
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            if len(topics) >= 2:
                return topics[1].hex()
        return receipt["transactionHash"].hex()

    def _to_bytes32(self, value: str | bytes) -> bytes:
        if isinstance(value, bytes):
            return value.ljust(32, b"\x00")[:32]
        return bytes.fromhex(value.removeprefix("0x")).ljust(32, b"\x00")[:32]

    def _require_account(self) -> None:
        if self._account is None:
            raise ValueError("SponsorshipAttestationClient: an account is required for write methods. Pass account= when constructing the client.")

    def _tx_params(self) -> dict:
        return {"from": self._account.address, "nonce": self._w3.eth.get_transaction_count(self._account.address), "gas": 300_000, "gasPrice": self._w3.eth.gas_price, "chainId": self._w3.eth.chain_id}

    async def _send(self, tx: dict) -> dict:
        signed = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._w3.eth.wait_for_transaction_receipt(tx_hash)
