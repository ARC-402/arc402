"""ComputeAgreementClient — interacts with the on-chain ComputeAgreement contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from web3 import Web3

if TYPE_CHECKING:
    from web3.contract import Contract
    from eth_account.signers.local import LocalAccount

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

COMPUTE_AGREEMENT_ABI = [
    {
        "type": "function", "name": "proposeSession",
        "inputs": [
            {"name": "sessionId", "type": "bytes32"},
            {"name": "provider", "type": "address"},
            {"name": "ratePerHour", "type": "uint256"},
            {"name": "maxHours", "type": "uint256"},
            {"name": "gpuSpecHash", "type": "bytes32"},
            {"name": "token", "type": "address"},
        ],
        "outputs": [], "stateMutability": "payable",
    },
    {
        "type": "function", "name": "acceptSession",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "startSession",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "submitUsageReport",
        "inputs": [
            {"name": "sessionId", "type": "bytes32"},
            {"name": "periodStart", "type": "uint256"},
            {"name": "periodEnd", "type": "uint256"},
            {"name": "computeMinutes", "type": "uint256"},
            {"name": "avgUtilization", "type": "uint256"},
            {"name": "providerSignature", "type": "bytes"},
            {"name": "metricsHash", "type": "bytes32"},
        ],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "endSession",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "disputeSession",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "cancelSession",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "resolveDispute",
        "inputs": [
            {"name": "sessionId", "type": "bytes32"},
            {"name": "providerAmount", "type": "uint256"},
            {"name": "clientAmount", "type": "uint256"},
        ],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "claimDisputeTimeout",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "withdraw",
        "inputs": [{"name": "token", "type": "address"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "type": "function", "name": "getSession",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [{
            "name": "",
            "type": "tuple",
            "components": [
                {"name": "client", "type": "address"},
                {"name": "provider", "type": "address"},
                {"name": "token", "type": "address"},
                {"name": "ratePerHour", "type": "uint256"},
                {"name": "maxHours", "type": "uint256"},
                {"name": "depositAmount", "type": "uint256"},
                {"name": "startedAt", "type": "uint256"},
                {"name": "endedAt", "type": "uint256"},
                {"name": "consumedMinutes", "type": "uint256"},
                {"name": "proposedAt", "type": "uint256"},
                {"name": "disputedAt", "type": "uint256"},
                {"name": "gpuSpecHash", "type": "bytes32"},
                {"name": "status", "type": "uint8"},
            ],
        }],
        "stateMutability": "view",
    },
    {
        "type": "function", "name": "calculateCost",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "function", "name": "getUsageReports",
        "inputs": [{"name": "sessionId", "type": "bytes32"}],
        "outputs": [{
            "name": "",
            "type": "tuple[]",
            "components": [
                {"name": "periodStart", "type": "uint256"},
                {"name": "periodEnd", "type": "uint256"},
                {"name": "computeMinutes", "type": "uint256"},
                {"name": "avgUtilization", "type": "uint256"},
                {"name": "providerSignature", "type": "bytes"},
                {"name": "metricsHash", "type": "bytes32"},
            ],
        }],
        "stateMutability": "view",
    },
    {
        "type": "function", "name": "pendingWithdrawals",
        "inputs": [{"name": "user", "type": "address"}, {"name": "token", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
]


@dataclass
class ComputeSession:
    client: str
    provider: str
    token: str
    rate_per_hour: int
    max_hours: int
    deposit_amount: int
    started_at: int
    ended_at: int
    consumed_minutes: int
    proposed_at: int
    disputed_at: int
    gpu_spec_hash: bytes
    status: int


@dataclass
class ComputeUsageReport:
    period_start: int
    period_end: int
    compute_minutes: int
    avg_utilization: int
    provider_signature: bytes
    metrics_hash: bytes


class ComputeAgreementClient:
    """Python wrapper for the ARC-402 ComputeAgreement contract."""

    def __init__(self, address: str, w3: Web3, account: "LocalAccount | None" = None):
        self._w3 = w3
        self._account = account
        self._contract: "Contract" = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=COMPUTE_AGREEMENT_ABI,
        )

    async def propose_session(
        self,
        session_id: bytes,
        provider: str,
        rate_per_hour: int,
        max_hours: int,
        gpu_spec_hash: bytes,
        token: str,
        deposit: int,
    ) -> str:
        self._require_account()
        is_eth = token == ZERO_ADDRESS or token is None
        params = self._tx_params()
        if is_eth:
            params["value"] = deposit
        tx = self._contract.functions.proposeSession(
            session_id,
            Web3.to_checksum_address(provider),
            rate_per_hour,
            max_hours,
            gpu_spec_hash,
            Web3.to_checksum_address(token) if token else ZERO_ADDRESS,
        ).build_transaction(params)
        receipt = await self._send(tx)
        return receipt["transactionHash"].hex()

    async def accept_session(self, session_id: bytes) -> str:
        return await self._simple_write("acceptSession", session_id)

    async def start_session(self, session_id: bytes) -> str:
        return await self._simple_write("startSession", session_id)

    async def submit_usage_report(
        self,
        session_id: bytes,
        period_start: int,
        period_end: int,
        compute_minutes: int,
        avg_utilization: int,
        provider_signature: bytes,
        metrics_hash: bytes,
    ) -> str:
        return await self._simple_write(
            "submitUsageReport",
            session_id,
            period_start,
            period_end,
            compute_minutes,
            avg_utilization,
            provider_signature,
            metrics_hash,
        )

    async def end_session(self, session_id: bytes) -> str:
        return await self._simple_write("endSession", session_id)

    async def dispute_session(self, session_id: bytes) -> str:
        return await self._simple_write("disputeSession", session_id)

    async def cancel_session(self, session_id: bytes) -> str:
        return await self._simple_write("cancelSession", session_id)

    async def resolve_dispute(self, session_id: bytes, provider_amount: int, client_amount: int) -> str:
        return await self._simple_write("resolveDispute", session_id, provider_amount, client_amount)

    async def claim_dispute_timeout(self, session_id: bytes) -> str:
        return await self._simple_write("claimDisputeTimeout", session_id)

    async def withdraw(self, token: str) -> str:
        return await self._simple_write("withdraw", Web3.to_checksum_address(token))

    def get_session(self, session_id: bytes) -> ComputeSession:
        raw = self._contract.functions.getSession(session_id).call()
        return ComputeSession(
            client=raw[0],
            provider=raw[1],
            token=raw[2],
            rate_per_hour=raw[3],
            max_hours=raw[4],
            deposit_amount=raw[5],
            started_at=raw[6],
            ended_at=raw[7],
            consumed_minutes=raw[8],
            proposed_at=raw[9],
            disputed_at=raw[10],
            gpu_spec_hash=raw[11],
            status=raw[12],
        )

    def calculate_cost(self, session_id: bytes) -> int:
        return self._contract.functions.calculateCost(session_id).call()

    def get_usage_reports(self, session_id: bytes) -> list[ComputeUsageReport]:
        raws = self._contract.functions.getUsageReports(session_id).call()
        return [
            ComputeUsageReport(
                period_start=r[0],
                period_end=r[1],
                compute_minutes=r[2],
                avg_utilization=r[3],
                provider_signature=r[4],
                metrics_hash=r[5],
            )
            for r in raws
        ]

    def pending_withdrawals(self, user: str, token: str) -> int:
        return self._contract.functions.pendingWithdrawals(
            Web3.to_checksum_address(user),
            Web3.to_checksum_address(token),
        ).call()

    # ─── Private ──────────────────────────────────────────────────────────────

    async def _simple_write(self, fn_name: str, *args) -> str:
        self._require_account()
        fn = getattr(self._contract.functions, fn_name)(*args)
        receipt = await self._send(fn.build_transaction(self._tx_params()))
        return receipt["transactionHash"].hex()

    def _require_account(self) -> None:
        if self._account is None:
            raise ValueError(
                "ComputeAgreementClient: an account is required for write methods. "
                "Pass account= when constructing the client."
            )

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
