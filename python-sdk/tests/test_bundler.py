"""Tests for arc402.bundler — HTTP calls are fully mocked."""

from unittest.mock import MagicMock, patch

import pytest

from arc402.bundler import (
    DEFAULT_BUNDLER_URL,
    DEFAULT_ENTRY_POINT,
    BundlerClient,
    UserOperation,
    build_user_op,
)

FAKE_SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
FAKE_CALL_DATA = "0xdeadbeef"
FAKE_HASH = "0xabc123"


def make_client() -> BundlerClient:
    return BundlerClient(
        bundler_url=DEFAULT_BUNDLER_URL,
        entry_point=DEFAULT_ENTRY_POINT,
        chain_id=8453,
    )


def rpc_ok(result) -> MagicMock:
    resp = MagicMock()
    resp.ok = True
    resp.json.return_value = {"jsonrpc": "2.0", "id": 1, "result": result}
    return resp


def rpc_err(code: int, message: str) -> MagicMock:
    resp = MagicMock()
    resp.ok = True
    resp.json.return_value = {
        "jsonrpc": "2.0",
        "id": 1,
        "error": {"code": code, "message": message},
    }
    return resp


# ---------------------------------------------------------------------------
# UserOperation.to_rpc_dict
# ---------------------------------------------------------------------------

class TestUserOperationToRpcDict:
    def _minimal(self) -> UserOperation:
        return UserOperation(
            sender=FAKE_SENDER,
            nonce="0x1",
            call_data=FAKE_CALL_DATA,
            call_gas_limit="0x493e0",
            verification_gas_limit="0x249f0",
            pre_verification_gas="0xc350",
            max_fee_per_gas="0x3b9aca00",
            max_priority_fee_per_gas="0x5f5e100",
            signature="0x",
        )

    def test_required_fields_present(self):
        d = self._minimal().to_rpc_dict()
        for key in (
            "sender", "nonce", "callData", "callGasLimit",
            "verificationGasLimit", "preVerificationGas",
            "maxFeePerGas", "maxPriorityFeePerGas", "signature",
        ):
            assert key in d

    def test_optional_fields_omitted_when_none(self):
        d = self._minimal().to_rpc_dict()
        for key in ("factory", "factoryData", "paymaster", "paymasterData",
                    "paymasterVerificationGasLimit", "paymasterPostOpGasLimit"):
            assert key not in d

    def test_optional_fields_included_when_set(self):
        op = self._minimal()
        op.factory = "0xFACTORY"
        op.paymaster = "0xPAYMASTER"
        d = op.to_rpc_dict()
        assert d["factory"] == "0xFACTORY"
        assert d["paymaster"] == "0xPAYMASTER"


# ---------------------------------------------------------------------------
# BundlerClient.send_user_operation
# ---------------------------------------------------------------------------

class TestSendUserOperation:
    def _op(self) -> UserOperation:
        return UserOperation(
            sender=FAKE_SENDER,
            nonce="0x0",
            call_data=FAKE_CALL_DATA,
            call_gas_limit="0x493e0",
            verification_gas_limit="0x249f0",
            pre_verification_gas="0xc350",
            max_fee_per_gas="0x3b9aca00",
            max_priority_fee_per_gas="0x5f5e100",
            signature="0x",
        )

    def test_returns_user_op_hash(self):
        client = make_client()
        with patch("arc402.bundler.requests.post", return_value=rpc_ok(FAKE_HASH)) as mock_post:
            result = client.send_user_operation(self._op())
        assert result == FAKE_HASH
        call_json = mock_post.call_args.kwargs["json"]
        assert call_json["method"] == "eth_sendUserOperation"
        assert call_json["params"][1] == DEFAULT_ENTRY_POINT

    def test_rpc_error_raises(self):
        client = make_client()
        with patch("arc402.bundler.requests.post", return_value=rpc_err(-32000, "AA21")):
            with pytest.raises(RuntimeError, match="AA21"):
                client.send_user_operation(self._op())

    def test_http_error_raises(self):
        client = make_client()
        bad_resp = MagicMock()
        bad_resp.ok = False
        bad_resp.status_code = 503
        bad_resp.reason = "Service Unavailable"
        with patch("arc402.bundler.requests.post", return_value=bad_resp):
            with pytest.raises(RuntimeError, match="503"):
                client.send_user_operation(self._op())


# ---------------------------------------------------------------------------
# BundlerClient.get_user_operation_receipt
# ---------------------------------------------------------------------------

class TestGetUserOperationReceipt:
    def test_returns_receipt_on_first_poll(self):
        receipt = {"userOpHash": FAKE_HASH, "success": True}
        client = make_client()
        with patch("arc402.bundler.requests.post", return_value=rpc_ok(receipt)):
            result = client.get_user_operation_receipt(FAKE_HASH)
        assert result == receipt

    def test_polls_until_receipt_available(self):
        receipt = {"userOpHash": FAKE_HASH, "success": True}
        responses = [rpc_ok(None), rpc_ok(None), rpc_ok(receipt)]
        client = make_client()
        with patch("arc402.bundler.requests.post", side_effect=responses), \
             patch("arc402.bundler.time.sleep"):
            result = client.get_user_operation_receipt(FAKE_HASH)
        assert result == receipt

    def test_timeout_raises(self):
        client = make_client()
        with patch("arc402.bundler.requests.post", return_value=rpc_ok(None)), \
             patch("arc402.bundler.time.sleep"), \
             patch("arc402.bundler._MAX_ATTEMPTS", 3):
            with pytest.raises(TimeoutError, match=FAKE_HASH):
                client.get_user_operation_receipt(FAKE_HASH)


# ---------------------------------------------------------------------------
# BundlerClient.estimate_user_operation_gas
# ---------------------------------------------------------------------------

class TestEstimateUserOperationGas:
    def test_returns_estimate(self):
        estimate = {
            "callGasLimit": "0x493e0",
            "verificationGasLimit": "0x249f0",
            "preVerificationGas": "0xc350",
        }
        client = make_client()
        partial_op = {"sender": FAKE_SENDER, "nonce": "0x0", "callData": FAKE_CALL_DATA}
        with patch("arc402.bundler.requests.post", return_value=rpc_ok(estimate)) as mock_post:
            result = client.estimate_user_operation_gas(partial_op)
        assert result == estimate
        call_json = mock_post.call_args.kwargs["json"]
        assert call_json["method"] == "eth_estimateUserOperationGas"


# ---------------------------------------------------------------------------
# build_user_op helper
# ---------------------------------------------------------------------------

class TestBuildUserOp:
    def test_builds_op_with_fee_data(self):
        mock_w3 = MagicMock()
        mock_w3.eth.fee_history.return_value = {
            "baseFeePerGas": [1_000_000_000, 1_200_000_000],
            "reward": [[100_000_000]],
        }
        op = build_user_op(FAKE_SENDER, FAKE_CALL_DATA, 5, mock_w3)
        assert op.sender == FAKE_SENDER
        assert op.nonce == hex(5)
        assert op.call_data == FAKE_CALL_DATA
        assert op.signature == "0x"
        # fee values should be hex strings
        assert op.max_fee_per_gas.startswith("0x")
        assert op.max_priority_fee_per_gas.startswith("0x")

    def test_falls_back_on_fee_error(self):
        mock_w3 = MagicMock()
        mock_w3.eth.fee_history.side_effect = Exception("not supported")
        op = build_user_op(FAKE_SENDER, FAKE_CALL_DATA, 0, mock_w3)
        assert op.max_fee_per_gas == hex(1_000_000_000)
        assert op.max_priority_fee_per_gas == hex(100_000_000)

    def test_exported_from_package(self):
        import arc402
        assert hasattr(arc402, "BundlerClient")
        assert hasattr(arc402, "UserOperation")
        assert hasattr(arc402, "build_user_op")
        assert arc402.DEFAULT_ENTRY_POINT == DEFAULT_ENTRY_POINT
        assert arc402.DEFAULT_BUNDLER_URL == DEFAULT_BUNDLER_URL
