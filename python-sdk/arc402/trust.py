"""TrustClient — interacts with the on-chain TrustRegistry contract."""

from __future__ import annotations

from typing import TYPE_CHECKING

from web3 import Web3

from .abis import TrustRegistry_ABI
from .types import CapabilitySlot, TrustProfile, TrustScore

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class TrustClient:
    def __init__(self, w3: Web3, address: str, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: Contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=TrustRegistry_ABI,
        )

    async def get_score(self, wallet_address: str) -> TrustScore:
        raw = self._contract.functions.getScore(Web3.to_checksum_address(wallet_address)).call()
        return TrustScore.from_raw(raw)

    async def get_global_score(self, wallet_address: str) -> int:
        fn = getattr(self._contract.functions, "getGlobalScore", None)
        if fn is None:
            return self._contract.functions.getScore(Web3.to_checksum_address(wallet_address)).call()
        return fn(Web3.to_checksum_address(wallet_address)).call()

    async def get_effective_score(self, wallet_address: str) -> int:
        fn = getattr(self._contract.functions, "getEffectiveScore", None)
        if fn is None:
            return self._contract.functions.getScore(Web3.to_checksum_address(wallet_address)).call()
        return fn(Web3.to_checksum_address(wallet_address)).call()

    async def get_profile(self, wallet_address: str) -> TrustProfile:
        return TrustProfile.from_raw(self._contract.functions.profiles(Web3.to_checksum_address(wallet_address)).call())

    async def get_capability_score(self, wallet_address: str, capability: str) -> int:
        fn = getattr(self._contract.functions, "getCapabilityScore", None)
        if fn is None:
            return 0
        return fn(Web3.to_checksum_address(wallet_address), capability).call()

    async def get_capability_slots(self, wallet_address: str) -> list[CapabilitySlot]:
        fn = getattr(self._contract.functions, "getCapabilitySlots", None)
        if fn is None:
            return []
        return [CapabilitySlot.from_raw(raw) for raw in fn(Web3.to_checksum_address(wallet_address)).call()]

    async def meets_threshold(self, wallet_address: str, min_score: int) -> bool:
        fn = getattr(self._contract.functions, "meetsThreshold", None)
        if fn is None:
            score = self._contract.functions.getScore(Web3.to_checksum_address(wallet_address)).call()
            return score >= min_score
        return fn(Web3.to_checksum_address(wallet_address), min_score).call()

    async def meets_capability_threshold(self, wallet_address: str, min_score: int, capability: str) -> bool:
        fn = getattr(self._contract.functions, "meetsCapabilityThreshold", None)
        if fn is None:
            return False
        return fn(Web3.to_checksum_address(wallet_address), min_score, capability).call()

    async def get_level(self, wallet_address: str) -> str:
        score = await self.get_effective_score(wallet_address)
        return TrustScore.from_raw(score).level

    async def init_wallet(self, wallet_address: str) -> str:
        return await self._simple_write("initWallet", Web3.to_checksum_address(wallet_address))

    async def record_success(
        self,
        wallet_address: str,
        counterparty: str | None = None,
        capability: str = "general",
        agreement_value_wei: int = 0,
    ) -> str:
        if hasattr(self._contract.functions, "recordSuccess"):
            fn = self._contract.functions.recordSuccess
            try:
                tx = fn(
                    Web3.to_checksum_address(wallet_address),
                    Web3.to_checksum_address(counterparty or wallet_address),
                    capability,
                    agreement_value_wei,
                ).build_transaction(self._tx_params())
            except TypeError:
                tx = fn(Web3.to_checksum_address(wallet_address)).build_transaction(self._tx_params())
            receipt = await self._send(tx)
            return receipt["transactionHash"].hex()
        raise ValueError("TrustClient: recordSuccess not available on contract ABI")

    async def record_anomaly(
        self,
        wallet_address: str,
        counterparty: str | None = None,
        capability: str = "general",
        agreement_value_wei: int = 0,
    ) -> str:
        if hasattr(self._contract.functions, "recordAnomaly"):
            fn = self._contract.functions.recordAnomaly
            try:
                tx = fn(
                    Web3.to_checksum_address(wallet_address),
                    Web3.to_checksum_address(counterparty or wallet_address),
                    capability,
                    agreement_value_wei,
                ).build_transaction(self._tx_params())
            except TypeError:
                tx = fn(Web3.to_checksum_address(wallet_address)).build_transaction(self._tx_params())
            receipt = await self._send(tx)
            return receipt["transactionHash"].hex()
        raise ValueError("TrustClient: recordAnomaly not available on contract ABI")

    async def _simple_write(self, fn_name: str, *args) -> str:
        self._require_account()
        receipt = await self._send(getattr(self._contract.functions, fn_name)(*args).build_transaction(self._tx_params()))
        return receipt["transactionHash"].hex()

    def _require_account(self) -> None:
        if self._account is None:
            raise ValueError("TrustClient: an account is required for write methods. Pass account= when constructing the client.")

    def _tx_params(self) -> dict:
        self._require_account()
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
