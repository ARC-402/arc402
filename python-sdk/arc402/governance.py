"""ARC402GovernanceClient — multisig governance reads and interactions."""

from __future__ import annotations

from typing import TYPE_CHECKING

from web3 import Web3

from .abis import ARC402Governance_ABI
from .types import GovernanceTransaction

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


class ARC402GovernanceClient:
    def __init__(self, address: str, w3: Web3, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: "Contract" = w3.eth.contract(address=Web3.to_checksum_address(address), abi=ARC402Governance_ABI)

    def threshold(self) -> int:
        return self._contract.functions.threshold().call()

    def transaction_count(self) -> int:
        return self._contract.functions.transactionCount().call()

    def get_transaction(self, tx_id: int) -> GovernanceTransaction:
        return GovernanceTransaction.from_raw(self._contract.functions.getTransaction(tx_id).call())

    def list_signers(self) -> list[str]:
        signers = []
        idx = 0
        while True:
            try:
                signers.append(self._contract.functions.signers(idx).call())
            except Exception:
                return signers
            idx += 1

    def is_confirmed(self, tx_id: int, signer: str) -> bool:
        return self._contract.functions.isConfirmed(tx_id, Web3.to_checksum_address(signer)).call()
