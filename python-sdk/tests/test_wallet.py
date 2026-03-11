"""Tests for ARC402Wallet."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
import pytest

from arc402 import ARC402Wallet
from arc402.exceptions import (
    ContextAlreadyOpen,
    ContextNotOpen,
    NetworkNotSupported,
    PolicyViolation,
)
from arc402.types import TrustScore


FAKE_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
FAKE_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
FAKE_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"


def make_wallet():
    with patch("arc402.wallet.Web3") as MockWeb3, \
         patch("arc402.policy.Web3") as MockWeb3Policy, \
         patch("arc402.trust.Web3") as MockWeb3Trust, \
         patch("arc402.intent.Web3") as MockWeb3Intent, \
         patch("arc402.settlement.Web3") as MockWeb3Settlement:

        for m in [MockWeb3, MockWeb3Policy, MockWeb3Trust, MockWeb3Intent, MockWeb3Settlement]:
            m.to_checksum_address.side_effect = lambda x: x
            m.to_wei.side_effect = lambda val, unit: int(float(val) * 10**18)

        w3 = MagicMock()
        w3.eth.chain_id = 84532
        w3.eth.gas_price = 1_000_000_000
        w3.eth.get_transaction_count.return_value = 0
        w3.eth.contract.return_value = MagicMock()

        MockWeb3.HTTPProvider.return_value = MagicMock()
        MockWeb3.return_value = w3

        wallet = ARC402Wallet(
            address=FAKE_ADDRESS,
            private_key=FAKE_PRIVATE_KEY,
            network="base-sepolia",
        )
        wallet._w3 = w3

        # Mock contract calls
        wallet._wallet_contract = MagicMock()
        wallet._wallet_contract.functions.contextOpen.return_value.call.return_value = False
        wallet._wallet_contract.functions.openContext.return_value.build_transaction.return_value = {}
        wallet._wallet_contract.functions.closeContext.return_value.build_transaction.return_value = {}
        wallet._wallet_contract.functions.executeSpend.return_value.build_transaction.return_value = {}

        # Mock _send
        fake_receipt = {"transactionHash": bytes.fromhex("ab" * 32), "logs": []}
        wallet._send = AsyncMock(return_value=fake_receipt)

        # Mock sub-clients
        wallet._policy = MagicMock()
        wallet._policy.validate_spend = AsyncMock()
        wallet._policy.set_policy = AsyncMock(return_value="0x" + "ab" * 32)

        wallet._trust = MagicMock()
        wallet._trust.get_score = AsyncMock(return_value=TrustScore.from_raw(105))
        wallet._trust.record_success = AsyncMock()
        wallet._trust.record_anomaly = AsyncMock()

        wallet._intent = MagicMock()
        wallet._intent.attest = AsyncMock(return_value=b"\xab" * 32)
        wallet._intent.history = AsyncMock(return_value=[])

        wallet._settlement = MagicMock()

        return wallet


class TestARC402WalletInit:
    def test_unsupported_network_raises(self):
        with pytest.raises(NetworkNotSupported):
            ARC402Wallet(
                address=FAKE_ADDRESS,
                private_key=FAKE_PRIVATE_KEY,
                network="ethereum",
            )

    def test_address_set(self):
        wallet = make_wallet()
        assert wallet.address == FAKE_ADDRESS

    def test_network_set(self):
        wallet = make_wallet()
        assert wallet.network == "base-sepolia"


class TestContextManager:
    def test_context_opens_and_closes(self):
        wallet = make_wallet()

        async def run():
            async with wallet.context("claims_processing", task_id="claim-001") as ctx:
                assert wallet._active_context_id is not None

        asyncio.run(run())
        assert wallet._active_context_id is None

    def test_context_records_success_on_clean_exit(self):
        wallet = make_wallet()

        async def run():
            async with wallet.context("claims_processing"):
                pass

        asyncio.run(run())
        wallet._trust.record_success.assert_called_once_with(FAKE_ADDRESS)

    def test_context_records_anomaly_on_exception(self):
        wallet = make_wallet()

        async def run():
            try:
                async with wallet.context("claims_processing"):
                    raise ValueError("something went wrong")
            except ValueError:
                pass

        asyncio.run(run())
        wallet._trust.record_anomaly.assert_called_once_with(FAKE_ADDRESS)


class TestSpend:
    def test_spend_without_context_raises(self):
        wallet = make_wallet()

        async def run():
            await wallet.spend(
                recipient=FAKE_RECIPIENT,
                amount="0.05 ether",
                category="claims_processing",
                reason="Test",
            )

        with pytest.raises(ContextNotOpen):
            asyncio.run(run())

    def test_spend_within_context(self):
        wallet = make_wallet()

        async def run():
            async with wallet.context("claims_processing"):
                tx_hash = await wallet.spend(
                    recipient=FAKE_RECIPIENT,
                    amount="0.05 ether",
                    category="claims_processing",
                    reason="Medical records for claim #001",
                )
            return tx_hash

        tx_hash = asyncio.run(run())
        assert tx_hash is not None
        wallet._policy.validate_spend.assert_called_once()
        wallet._intent.attest.assert_called_once()

    def test_spend_policy_violation_propagates(self):
        wallet = make_wallet()
        wallet._policy.validate_spend = AsyncMock(
            side_effect=PolicyViolation("Exceeds limit", category="claims_processing")
        )

        async def run():
            async with wallet.context("claims_processing"):
                await wallet.spend(
                    recipient=FAKE_RECIPIENT,
                    amount="100 ether",
                    category="claims_processing",
                    reason="Too much",
                )

        with pytest.raises(PolicyViolation):
            asyncio.run(run())

    def test_amount_parsing_ether_string(self):
        from arc402.wallet import _parse_amount
        assert _parse_amount("0.1 ether") == 10**17

    def test_amount_parsing_int(self):
        from arc402.wallet import _parse_amount
        assert _parse_amount(12345) == 12345

    def test_amount_parsing_gwei(self):
        from arc402.wallet import _parse_amount
        assert _parse_amount("100 gwei") == 100 * 10**9


class TestTrustScore:
    def test_trust_score_returns_score(self):
        wallet = make_wallet()

        async def run():
            return await wallet.trust_score()

        score = asyncio.run(run())
        assert score.score == 105
        assert score.level == "restricted"


class TestSetPolicy:
    def test_set_policy_delegates(self):
        wallet = make_wallet()

        async def run():
            return await wallet.set_policy({
                "claims_processing": "0.1 ether",
                "research": "0.05 ether",
            })

        tx = asyncio.run(run())
        wallet._policy.set_policy.assert_called_once()
