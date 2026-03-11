"""Tests for PolicyClient."""

from unittest.mock import MagicMock, patch
import pytest

from arc402.policy import PolicyClient
from arc402.exceptions import PolicyViolation


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
        return client, contract_mock


class TestPolicyClient:
    def test_validate_spend_passes(self):
        client, contract = make_policy_client()
        contract.functions.validateSpend.return_value.call.return_value = (True, "")

        import asyncio
        asyncio.run(client.validate_spend(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "claims_processing",
            50_000_000_000_000_000,
            b"\x00" * 32,
        ))

    def test_validate_spend_raises_policy_violation(self):
        client, contract = make_policy_client()
        contract.functions.validateSpend.return_value.call.return_value = (
            False, "Exceeds category limit"
        )

        import asyncio
        with pytest.raises(PolicyViolation) as exc_info:
            asyncio.run(client.validate_spend(
                "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                "claims_processing",
                999_000_000_000_000_000,
                b"\x00" * 32,
            ))
        assert "Exceeds category limit" in str(exc_info.value)
        assert exc_info.value.category == "claims_processing"

    def test_get_category_limit(self):
        client, contract = make_policy_client()
        contract.functions.categoryLimits.return_value.call.return_value = 100_000_000_000_000_000

        import asyncio
        limit = asyncio.run(client.get_category_limit(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "claims_processing",
        ))
        assert limit == 100_000_000_000_000_000
