"""Tests for PolicyClient."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from arc402.exceptions import PolicyViolation
from arc402.policy import PolicyClient


def make_policy_client():
    w3 = MagicMock()
    w3.eth.chain_id = 84532
    w3.eth.gas_price = 1_000_000_000
    w3.eth.get_transaction_count.return_value = 0
    account = MagicMock()
    account.address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

    with patch("arc402.policy.Web3") as mock_web3:
        mock_web3.to_checksum_address.side_effect = lambda x: x
        contract_mock = MagicMock()
        w3.eth.contract.return_value = contract_mock
        client = PolicyClient(w3, "0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2", account)
        client._contract = contract_mock
        client._send = AsyncMock(return_value={"transactionHash": bytes.fromhex("ab" * 32)})
        return client, contract_mock


class TestPolicyClient:
    def test_validate_spend_passes(self):
        client, contract = make_policy_client()
        contract.functions.validateSpend.return_value.call.return_value = (True, "")

        import asyncio
        asyncio.run(client.validate_spend("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "claims_processing", 50, b"\x00" * 32))

    def test_validate_spend_raises_policy_violation(self):
        client, contract = make_policy_client()
        contract.functions.validateSpend.return_value.call.return_value = (False, "Exceeds category limit")

        import asyncio
        with pytest.raises(PolicyViolation):
            asyncio.run(client.validate_spend("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "claims_processing", 999, b"\x00" * 32))

    def test_set_policy_applies_category_limits(self):
        client, contract = make_policy_client()
        contract.functions.setPolicy.return_value.build_transaction.return_value = {}
        contract.functions.setCategoryLimitFor.return_value.build_transaction.return_value = {}

        import asyncio
        tx_hash = asyncio.run(client.set_policy("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", {"claims": "0.1 ether", "ops": 5}))
        assert tx_hash == ("ab" * 32)
        assert contract.functions.setCategoryLimitFor.call_count == 2
