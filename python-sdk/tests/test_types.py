"""Tests for ARC-402 type primitives."""

from arc402.types import (
    Agreement,
    AgreementStatus,
    CapabilitySlot,
    DisputeCase,
    DisputeOutcome,
    EvidenceType,
    GovernanceTransaction,
    IdentityTier,
    OperationalMetrics,
    PolicyConfig,
    ProviderResponseType,
    RemediationCase,
    RemediationResponse,
    SponsorshipAttestationRecord,
    TrustProfile,
    TrustScore,
    _next_level_at,
    _trust_level_from_score,
)


class TestTrustScore:
    def test_trust_ranges(self):
        assert TrustScore.from_raw(299).level == "restricted"
        assert TrustScore.from_raw(300).level == "standard"
        assert TrustScore.from_raw(700).level == "trusted"
        assert TrustScore.from_raw(1000).level == "verified"
        assert _trust_level_from_score(105) == "restricted"
        assert _next_level_at(700) == 1000


class TestPolicyConfig:
    def test_unit_parsing(self):
        config = PolicyConfig.from_dict({"claims": "0.1 ether", "fee": "100 gwei", "flat": 7})
        assert config.categories["claims"] == 10**17
        assert config.categories["fee"] == 100 * 10**9
        assert config.categories["flat"] == 7


class TestProtocolModels:
    def test_agreement_from_raw_v2(self):
        agreement = Agreement.from_raw((1, "0xC", "0xP", "claims.v1", "desc", 5, "0x0", 10, b"\x11" * 32, 8, 11, 12, 13, b"\x22" * 32))
        assert agreement.status == AgreementStatus.PARTIAL_SETTLEMENT
        assert agreement.deliverables_hash == "11" * 32
        assert agreement.committed_hash == "22" * 32

    def test_remediation_and_dispute_models(self):
        remediation = RemediationCase.from_raw((2, 1, 2, 3, b"\xaa" * 32, True))
        response = RemediationResponse.from_raw((2, "0xP", 4, 50, b"\xbb" * 32, "ipfs://x", b"\xaa" * 32, b"\xcc" * 32, 99))
        dispute = DisputeCase.from_raw((7, 1, 2, 4, 60, 40, False, 3))
        assert remediation.cycle_count == 2
        assert response.response_type == ProviderResponseType.PARTIAL_SETTLEMENT
        assert dispute.outcome == DisputeOutcome.PARTIAL_PROVIDER

    def test_other_models(self):
        profile = TrustProfile.from_raw((120, 100, b"\x01" * 32))
        slot = CapabilitySlot.from_raw((b"\x02" * 32, 88))
        metrics = OperationalMetrics.from_raw((60, 15, 100, 200, 3, 1, 95, 90))
        attestation = SponsorshipAttestationRecord.from_raw(("0xS", "0xA", 1, 2, False, 2, "ipfs://proof"))
        tx = GovernanceTransaction.from_raw(("0xT", 1, b"\x99\x88", False, 2))
        assert profile.global_score == 120
        assert slot.score == 88
        assert metrics.uptime_score == 95
        assert attestation.tier == IdentityTier.VERIFIED_PROVIDER
        assert tx.data == "9988"
        assert EvidenceType.DELIVERABLE.value == 2
