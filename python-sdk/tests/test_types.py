"""Tests for ARC-402 type primitives."""

import pytest
from arc402.types import TrustScore, PolicyConfig, _trust_level_from_score, _next_level_at


class TestTrustScore:
    def test_restricted_range(self):
        score = TrustScore.from_raw(0)
        assert score.level == "restricted"
        assert score.next_level_at == 300

    def test_restricted_upper(self):
        score = TrustScore.from_raw(299)
        assert score.level == "restricted"
        assert score.next_level_at == 300

    def test_standard_range(self):
        score = TrustScore.from_raw(300)
        assert score.level == "standard"
        assert score.next_level_at == 700

    def test_trusted_range(self):
        score = TrustScore.from_raw(700)
        assert score.level == "trusted"
        assert score.next_level_at == 1000

    def test_verified_range(self):
        score = TrustScore.from_raw(1000)
        assert score.level == "verified"
        assert score.next_level_at is None

    def test_high_verified(self):
        score = TrustScore.from_raw(9999)
        assert score.level == "verified"
        assert score.next_level_at is None

    def test_score_preserved(self):
        score = TrustScore.from_raw(105)
        assert score.score == 105


class TestPolicyConfig:
    def test_ether_string(self):
        config = PolicyConfig.from_dict({"claims_processing": "0.1 ether"})
        assert config.categories["claims_processing"] == 10**17  # 0.1 ether in wei

    def test_multi_category(self):
        config = PolicyConfig.from_dict({
            "claims_processing": "0.1 ether",
            "research": "0.05 ether",
            "protocol_fee": "0.01 ether",
        })
        assert len(config.categories) == 3
        assert config.categories["research"] == 5 * 10**16

    def test_integer_value(self):
        config = PolicyConfig.from_dict({"claims": 1000000})
        assert config.categories["claims"] == 1000000

    def test_gwei_string(self):
        config = PolicyConfig.from_dict({"fee": "100 gwei"})
        assert config.categories["fee"] == 100 * 10**9
