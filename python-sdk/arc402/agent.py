"""AgentRegistryClient — interacts with the on-chain AgentRegistry contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from web3 import Web3

from .abis import AgentRegistry_ABI
from .types import OperationalMetrics

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount


@dataclass
class AgentInfo:
    wallet: str
    name: str
    capabilities: list[str]
    service_type: str
    endpoint: str
    metadata_uri: str
    active: bool
    registered_at: int
    endpoint_changed_at: int = 0
    endpoint_change_count: int = 0
    trust_score: int = 0
    operational_metrics: OperationalMetrics | None = None
    endpoint_stability: int | None = None

    @classmethod
    def from_raw(cls, raw: tuple, trust_score: int = 0) -> "AgentInfo":
        wallet, name, capabilities, service_type, endpoint, metadata_uri, active, registered_at, *rest = raw
        endpoint_changed_at = rest[0] if len(rest) > 0 else 0
        endpoint_change_count = rest[1] if len(rest) > 1 else 0
        return cls(
            wallet=wallet,
            name=name,
            capabilities=list(capabilities),
            service_type=service_type,
            endpoint=endpoint,
            metadata_uri=metadata_uri,
            active=active,
            registered_at=registered_at,
            endpoint_changed_at=endpoint_changed_at,
            endpoint_change_count=endpoint_change_count,
            trust_score=trust_score,
        )


class AgentRegistryClient:
    def __init__(self, address: str, w3: Web3, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: "Contract" = w3.eth.contract(address=Web3.to_checksum_address(address), abi=AgentRegistry_ABI)

    async def register(self, name: str, capabilities: list[str], service_type: str, endpoint: str, metadata_uri: str) -> str:
        return await self._simple_write("register", name, capabilities, service_type, endpoint, metadata_uri)

    async def update(self, name: str, capabilities: list[str], service_type: str, endpoint: str, metadata_uri: str) -> str:
        return await self._simple_write("update", name, capabilities, service_type, endpoint, metadata_uri)

    async def deactivate(self) -> str:
        return await self._simple_write("deactivate")

    async def reactivate(self) -> str:
        return await self._simple_write("reactivate")

    async def submit_heartbeat(self, latency_ms: int) -> str:
        return await self._simple_write("submitHeartbeat", latency_ms)

    async def set_heartbeat_policy(self, interval: int, grace_period: int) -> str:
        return await self._simple_write("setHeartbeatPolicy", interval, grace_period)

    def get_agent(self, wallet: str, include_operational: bool = False) -> AgentInfo:
        cs = Web3.to_checksum_address(wallet)
        raw = self._contract.functions.getAgent(cs).call()
        info = AgentInfo.from_raw(raw, trust_score=self.get_trust_score(wallet))
        if include_operational:
            info.operational_metrics = self.get_operational_metrics(wallet)
            info.endpoint_stability = self.get_endpoint_stability(wallet)
        return info

    def get_operational_metrics(self, wallet: str) -> OperationalMetrics:
        return OperationalMetrics.from_raw(self._contract.functions.getOperationalMetrics(Web3.to_checksum_address(wallet)).call())

    def is_registered(self, wallet: str) -> bool:
        return self._contract.functions.isRegistered(Web3.to_checksum_address(wallet)).call()

    def is_active(self, wallet: str) -> bool:
        return self._contract.functions.isActive(Web3.to_checksum_address(wallet)).call()

    def get_capabilities(self, wallet: str) -> list[str]:
        return list(self._contract.functions.getCapabilities(Web3.to_checksum_address(wallet)).call())

    def get_trust_score(self, wallet: str) -> int:
        return self._contract.functions.getTrustScore(Web3.to_checksum_address(wallet)).call()

    def get_endpoint_stability(self, wallet: str) -> int:
        return self._contract.functions.getEndpointStability(Web3.to_checksum_address(wallet)).call()

    def agent_count(self) -> int:
        return self._contract.functions.agentCount().call()

    def get_agent_at_index(self, index: int, include_operational: bool = False) -> AgentInfo:
        return self.get_agent(self._contract.functions.getAgentAtIndex(index).call(), include_operational=include_operational)

    def list_agents(self, limit: int = 100, include_operational: bool = False) -> list[AgentInfo]:
        count = min(self.agent_count(), limit)
        return [self.get_agent_at_index(i, include_operational=include_operational) for i in range(count)]

    def find_by_capability(self, capability: str, limit: int = 10, include_operational: bool = False) -> list[AgentInfo]:
        results: list[AgentInfo] = []
        for i in range(self.agent_count()):
            if len(results) >= limit:
                break
            agent = self.get_agent_at_index(i, include_operational=include_operational)
            if agent.active and capability in agent.capabilities:
                results.append(agent)
        return results

    def get_operational_trust(self, wallet: str) -> dict[str, int]:
        metrics = self.get_operational_metrics(wallet)
        return {
            "uptime_score": metrics.uptime_score,
            "response_score": metrics.response_score,
            "heartbeat_count": metrics.heartbeat_count,
            "missed_heartbeat_count": metrics.missed_heartbeat_count,
            "endpoint_stability": self.get_endpoint_stability(wallet),
        }

    async def _simple_write(self, fn_name: str, *args) -> str:
        self._require_account()
        receipt = await self._send(getattr(self._contract.functions, fn_name)(*args).build_transaction(self._tx_params()))
        return receipt["transactionHash"].hex()

    def _require_account(self) -> None:
        if self._account is None:
            raise ValueError("AgentRegistryClient: an account is required for write methods. Pass account= when constructing the client.")

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
