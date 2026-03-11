"""CapabilityRegistryClient — canonical capability taxonomy reads/writes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from web3 import Web3

from .abis import CapabilityRegistry_ABI
from .types import RootConfig

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class CapabilityRegistryClient:
    def __init__(self, address: str, w3: Web3, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: "Contract" = w3.eth.contract(address=Web3.to_checksum_address(address), abi=CapabilityRegistry_ABI)

    def root_count(self) -> int:
        return self._contract.functions.rootCount().call()

    def get_root(self, root: str) -> RootConfig:
        return RootConfig.from_raw(self._contract.functions.getRoot(root).call())

    def get_root_at(self, index: int) -> RootConfig:
        return RootConfig.from_raw(self._contract.functions.getRootAt(index).call())

    def list_roots(self) -> list[RootConfig]:
        return [self.get_root_at(i) for i in range(self.root_count())]

    def is_root_active(self, root: str) -> bool:
        return self._contract.functions.isRootActive(root).call()

    def get_capabilities(self, agent: str) -> list[str]:
        return list(self._contract.functions.getCapabilities(Web3.to_checksum_address(agent)).call())

    def capability_count(self, agent: str) -> int:
        return self._contract.functions.capabilityCount(Web3.to_checksum_address(agent)).call()

    def is_capability_claimed(self, agent: str, capability: str) -> bool:
        return self._contract.functions.isCapabilityClaimed(Web3.to_checksum_address(agent), capability).call()
