"""ContextBinding — async context manager for ARC-402 task contexts."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from web3 import Web3

if TYPE_CHECKING:
    from .wallet import ARC402Wallet


class ContextBinding:
    def __init__(self, wallet: "ARC402Wallet", task_type: str, task_id: str | None = None):
        self._wallet = wallet
        self._task_type = task_type
        self._task_id = task_id or os.urandom(16).hex()
        self._context_id: bytes = os.urandom(32)
        self.context_id_hex: str = self._context_id.hex()

    async def __aenter__(self) -> "ContextBinding":
        await self._wallet._open_context(self._context_id, self._task_type)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        success = exc_type is None
        await self._wallet._close_context(success=success)
        return None
