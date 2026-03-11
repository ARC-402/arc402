"""Pydantic models for ARC-402 primitives."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar

from pydantic import BaseModel, Field


NETWORKS: dict[str, dict[str, Any]] = {
    "base-sepolia": {
        "chain_id": 84532,
        "rpc_url": "https://sepolia.base.org",
        "policy_engine": "0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2",
        "trust_registry": "0xdA1D377991B2E580991B0DD381CdD635dd71aC39",
        "intent_attestation": "0xbB5E1809D4a94D08Bf1143131312858143D018f1",
        "settlement_coordinator": "0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460",
        "wallet_factory": "0x0000000000000000000000000000000000000000",
    },
    "base": {
        "chain_id": 8453,
        "rpc_url": "https://mainnet.base.org",
        # Mainnet addresses TBD — will be filled after mainnet deploy
        "policy_engine": None,
        "trust_registry": None,
        "intent_attestation": None,
        "settlement_coordinator": None,
        "wallet_factory": None,
    },
}

TRUST_LEVELS = {
    "restricted": (0, 299),
    "standard": (300, 699),
    "trusted": (700, 999),
    "verified": (1000, None),
}


def _trust_level_from_score(score: int) -> str:
    for level, (low, high) in TRUST_LEVELS.items():
        if high is None and score >= low:
            return level
        if high is not None and low <= score <= high:
            return level
    return "restricted"


def _next_level_at(score: int) -> int | None:
    level = _trust_level_from_score(score)
    levels = list(TRUST_LEVELS.keys())
    idx = levels.index(level)
    if idx + 1 >= len(levels):
        return None
    next_level = levels[idx + 1]
    return TRUST_LEVELS[next_level][0]


class TrustScore(BaseModel):
    score: int
    level: str
    next_level_at: int | None = None

    @classmethod
    def from_raw(cls, raw_score: int) -> "TrustScore":
        return cls(
            score=raw_score,
            level=_trust_level_from_score(raw_score),
            next_level_at=_next_level_at(raw_score),
        )


class AttestationRecord(BaseModel):
    id: str
    wallet: str
    action: str
    reason: str
    recipient: str
    amount: int
    timestamp: datetime

    @classmethod
    def from_raw(cls, raw: tuple) -> "AttestationRecord":
        id_, wallet, action, reason, recipient, amount, timestamp = raw
        return cls(
            id=id_.hex() if isinstance(id_, bytes) else id_,
            wallet=wallet,
            action=action,
            reason=reason,
            recipient=recipient,
            amount=amount,
            timestamp=datetime.fromtimestamp(timestamp),
        )


class PolicyConfig(BaseModel):
    categories: dict[str, int] = Field(default_factory=dict)

    @classmethod
    def from_dict(cls, config: dict[str, str | int]) -> "PolicyConfig":
        from web3 import Web3

        parsed: dict[str, int] = {}
        for category, limit in config.items():
            if isinstance(limit, str) and "ether" in limit:
                amount_str = limit.replace("ether", "").strip()
                parsed[category] = Web3.to_wei(amount_str, "ether")
            elif isinstance(limit, str) and "gwei" in limit:
                amount_str = limit.replace("gwei", "").strip()
                parsed[category] = Web3.to_wei(amount_str, "gwei")
            else:
                parsed[category] = int(limit)
        return cls(categories=parsed)


class ProposalStatus(BaseModel):
    proposal_id: str
    from_wallet: str
    to_wallet: str
    amount: int
    intent_id: str
    expires_at: datetime
    status: int
    rejection_reason: str

    STATUS_NAMES: ClassVar[dict[int, str]] = {0: "pending", 1: "accepted", 2: "rejected", 3: "executed", 4: "expired"}

    @property
    def status_name(self) -> str:
        return self.STATUS_NAMES.get(self.status, "unknown")
