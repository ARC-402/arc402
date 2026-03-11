"""ARC402Wallet — main entry point for the ARC-402 Python SDK."""

from __future__ import annotations

from eth_account import Account
from web3 import Web3

from .abis import ARC402Wallet_ABI, WalletFactory_ABI
from .context import ContextBinding
from .exceptions import ContextAlreadyOpen, ContextNotOpen, NetworkNotSupported, TransactionFailed
from .intent import IntentAttestation
from .policy import PolicyClient
from .settlement import MultiAgentSettlement
from .trust import TrustClient
from .types import AttestationRecord, NETWORKS, TrustScore


def _parse_amount(amount: str | int) -> int:
    if isinstance(amount, int):
        return amount
    if isinstance(amount, str):
        if "ether" in amount:
            return Web3.to_wei(amount.replace("ether", "").strip(), "ether")
        if "gwei" in amount:
            return Web3.to_wei(amount.replace("gwei", "").strip(), "gwei")
        return int(amount)
    raise TypeError(f"Cannot parse amount: {amount!r}")


class ARC402Wallet:
    def __init__(self, address: str, private_key: str, network: str = "base-sepolia"):
        if network not in NETWORKS:
            raise NetworkNotSupported(f"Network '{network}' is not supported. Choose from: {list(NETWORKS)}")

        net = NETWORKS[network]
        self._w3 = Web3(Web3.HTTPProvider(net["rpc_url"]))
        self._account = Account.from_key(private_key)
        self.address = Web3.to_checksum_address(address)
        self.network = network
        self._net_config = net

        self._wallet_contract = self._w3.eth.contract(address=self.address, abi=ARC402Wallet_ABI)
        self._policy = PolicyClient(self._w3, net["policy_engine"], self._account)
        self._trust = TrustClient(self._w3, net["trust_registry"], self._account)
        self._intent = IntentAttestation(self._w3, net["intent_attestation"], self._account)
        self._settlement = MultiAgentSettlement(self._w3, net["settlement_coordinator"], self._account)
        self._active_context_id: bytes | None = None

    @classmethod
    async def deploy(cls, private_key: str, network: str = "base-sepolia") -> "ARC402Wallet":
        if network not in NETWORKS:
            raise NetworkNotSupported(f"Network '{network}' is not supported.")
        net = NETWORKS[network]
        factory_address = net.get("wallet_factory")
        if not factory_address or factory_address == "0x0000000000000000000000000000000000000000":
            raise NetworkNotSupported(f"WalletFactory not deployed on {network}")

        w3 = Web3(Web3.HTTPProvider(net["rpc_url"]))
        account = Account.from_key(private_key)
        factory = w3.eth.contract(address=Web3.to_checksum_address(factory_address), abi=WalletFactory_ABI)
        tx = factory.functions.createWallet().build_transaction({
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address),
            "gas": 2_000_000,
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        })
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        wallet_address = None
        for log in receipt.get("logs", []):
            if len(log.get("topics", [])) >= 3:
                wallet_address = "0x" + log["topics"][2].hex()[-40:]
                break
        if not wallet_address:
            raise TransactionFailed("Could not extract wallet address from factory receipt", tx_hash.hex())
        return cls(address=wallet_address, private_key=private_key, network=network)

    def context(self, task_type: str, task_id: str | None = None) -> ContextBinding:
        return ContextBinding(self, task_type=task_type, task_id=task_id)

    async def set_policy(self, config: dict[str, str | int]) -> str:
        return await self._policy.set_policy(self.address, config)

    async def spend(self, recipient: str, amount: str | int, category: str, reason: str) -> str:
        if self._active_context_id is None:
            raise ContextNotOpen("No active context. Use 'async with wallet.context(...)' before spending.")
        wei_amount = _parse_amount(amount)
        await self._policy.validate_spend(self.address, category, wei_amount, self._active_context_id)
        attestation_id = await self._intent.attest(action=f"spend:{category}", reason=reason, recipient=recipient, amount=wei_amount)
        tx = self._wallet_contract.functions.executeSpend(Web3.to_checksum_address(recipient), wei_amount, category, attestation_id).build_transaction(self._tx_params())
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    async def trust_score(self) -> TrustScore:
        return await self._trust.get_score(self.address)

    async def attestations(self, limit: int = 10) -> list[AttestationRecord]:
        return await self._intent.history(self.address, limit=limit)

    async def _open_context(self, context_id: bytes, task_type: str) -> None:
        if self._wallet_contract.functions.contextOpen().call():
            raise ContextAlreadyOpen("A context is already open on this wallet.")
        await self._send(self._wallet_contract.functions.openContext(context_id, task_type).build_transaction(self._tx_params()))
        self._active_context_id = context_id

    async def _close_context(self, success: bool = True) -> None:
        try:
            await self._send(self._wallet_contract.functions.closeContext().build_transaction(self._tx_params()))
        finally:
            self._active_context_id = None
            if success:
                await self._trust.record_success(self.address)
            else:
                await self._trust.record_anomaly(self.address)

    def _tx_params(self) -> dict:
        return {
            "from": self._account.address,
            "nonce": self._w3.eth.get_transaction_count(self._account.address),
            "gas": 500_000,
            "gasPrice": self._w3.eth.gas_price,
            "chainId": self._w3.eth.chain_id,
        }

    async def _send(self, tx: dict) -> dict:
        signed = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._w3.eth.wait_for_transaction_receipt(tx_hash)

    @property
    def policy(self) -> PolicyClient:
        return self._policy

    @property
    def trust(self) -> TrustClient:
        return self._trust

    @property
    def intent(self) -> IntentAttestation:
        return self._intent

    @property
    def settlement(self) -> MultiAgentSettlement:
        return self._settlement
