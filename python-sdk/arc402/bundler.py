"""ERC-4337 BundlerClient — mirrors cli/src/bundler.ts."""

import time
from dataclasses import dataclass, field
from typing import Optional

import requests

DEFAULT_ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
DEFAULT_BUNDLER_URL = "https://api.pimlico.io/v2/base/rpc"

_POLL_INTERVAL_S = 2.0
_MAX_ATTEMPTS = 30


@dataclass
class UserOperation:
    """ERC-4337 v0.7 UserOperation."""

    sender: str
    nonce: str                        # hex
    call_data: str                    # hex
    call_gas_limit: str               # hex
    verification_gas_limit: str       # hex
    pre_verification_gas: str         # hex
    max_fee_per_gas: str              # hex
    max_priority_fee_per_gas: str     # hex
    signature: str                    # hex — empty "0x" for policy-auto-approved ops
    factory: Optional[str] = None
    factory_data: Optional[str] = None
    paymaster: Optional[str] = None
    paymaster_data: Optional[str] = None
    paymaster_verification_gas_limit: Optional[str] = None
    paymaster_post_op_gas_limit: Optional[str] = None

    def to_rpc_dict(self) -> dict:
        """Serialize to the camelCase dict expected by the bundler JSON-RPC."""
        d: dict = {
            "sender": self.sender,
            "nonce": self.nonce,
            "callData": self.call_data,
            "callGasLimit": self.call_gas_limit,
            "verificationGasLimit": self.verification_gas_limit,
            "preVerificationGas": self.pre_verification_gas,
            "maxFeePerGas": self.max_fee_per_gas,
            "maxPriorityFeePerGas": self.max_priority_fee_per_gas,
            "signature": self.signature,
        }
        if self.factory is not None:
            d["factory"] = self.factory
        if self.factory_data is not None:
            d["factoryData"] = self.factory_data
        if self.paymaster is not None:
            d["paymaster"] = self.paymaster
        if self.paymaster_data is not None:
            d["paymasterData"] = self.paymaster_data
        if self.paymaster_verification_gas_limit is not None:
            d["paymasterVerificationGasLimit"] = self.paymaster_verification_gas_limit
        if self.paymaster_post_op_gas_limit is not None:
            d["paymasterPostOpGasLimit"] = self.paymaster_post_op_gas_limit
        return d


class BundlerClient:
    """JSON-RPC client for an ERC-4337 bundler (e.g. Pimlico)."""

    def __init__(
        self,
        bundler_url: str = DEFAULT_BUNDLER_URL,
        entry_point: str = DEFAULT_ENTRY_POINT,
        chain_id: int = 8453,
    ) -> None:
        self.bundler_url = bundler_url
        self.entry_point = entry_point
        self.chain_id = chain_id

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _rpc(self, method: str, params: list) -> object:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        resp = requests.post(self.bundler_url, json=payload, timeout=30)
        if not resp.ok:
            raise RuntimeError(f"Bundler HTTP {resp.status_code}: {resp.reason}")
        data = resp.json()
        if "error" in data and data["error"] is not None:
            err = data["error"]
            raise RuntimeError(f"Bundler RPC error [{err.get('code')}]: {err.get('message')}")
        return data.get("result")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def send_user_operation(self, user_op: UserOperation) -> str:
        """Submit a UserOperation; returns the userOpHash."""
        result = self._rpc("eth_sendUserOperation", [user_op.to_rpc_dict(), self.entry_point])
        return str(result)

    def get_user_operation_receipt(self, user_op_hash: str) -> dict:
        """Poll until the UserOperation is confirmed; returns the receipt dict."""
        for _ in range(_MAX_ATTEMPTS):
            result = self._rpc("eth_getUserOperationReceipt", [user_op_hash])
            if result is not None:
                return result  # type: ignore[return-value]
            time.sleep(_POLL_INTERVAL_S)
        raise TimeoutError(
            f"UserOperation {user_op_hash} not confirmed after "
            f"{int(_MAX_ATTEMPTS * _POLL_INTERVAL_S)}s"
        )

    def estimate_user_operation_gas(self, user_op: dict) -> dict:
        """Call eth_estimateUserOperationGas; returns gas estimate dict."""
        result = self._rpc("eth_estimateUserOperationGas", [user_op, self.entry_point])
        return result  # type: ignore[return-value]


# ------------------------------------------------------------------
# Helper
# ------------------------------------------------------------------

def build_user_op(
    wallet_address: str,
    call_data: str,
    nonce: int,
    web3_provider,
) -> UserOperation:
    """Build a UserOperation with live fee data from *web3_provider*.

    *web3_provider* must expose ``eth.fee_history`` or ``eth.gas_price`` so
    that fee data can be fetched (a connected ``web3.Web3`` instance works).
    Falls back to conservative defaults when fee data is unavailable.
    """
    try:
        fee_history = web3_provider.eth.fee_history(1, "latest", [50])
        base_fee = fee_history["baseFeePerGas"][-1]
        priority = fee_history["reward"][0][0] if fee_history.get("reward") else 100_000_000
        max_priority_fee_per_gas = max(priority, 100_000_000)
        max_fee_per_gas = base_fee * 2 + max_priority_fee_per_gas
    except Exception:
        max_fee_per_gas = 1_000_000_000
        max_priority_fee_per_gas = 100_000_000

    return UserOperation(
        sender=wallet_address,
        nonce=hex(nonce),
        call_data=call_data,
        call_gas_limit=hex(300_000),
        verification_gas_limit=hex(150_000),
        pre_verification_gas=hex(50_000),
        max_fee_per_gas=hex(max_fee_per_gas),
        max_priority_fee_per_gas=hex(max_priority_fee_per_gas),
        signature="0x",
    )
