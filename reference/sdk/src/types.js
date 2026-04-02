"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisputeClass = exports.DisputeMode = exports.IdentityTier = exports.ReputationSignalType = exports.ArbitrationVote = exports.DirectDisputeReason = exports.EvidenceType = exports.DisputeOutcome = exports.ProviderResponseType = exports.AgreementStatus = exports.NETWORKS = void 0;
exports.NETWORKS = {
    "base-sepolia": {
        chainId: 84532,
        rpc: "https://sepolia.base.org",
        contracts: {
            policyEngine: "0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2",
            trustRegistry: "0xdA1D377991B2E580991B0DD381CdD635dd71aC39",
            intentAttestation: "0xbB5E1809D4a94D08Bf1143131312858143D018f1",
            settlementCoordinator: "0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460",
        },
    },
    base: {
        chainId: 8453,
        rpc: "https://mainnet.base.org",
        contracts: {
            policyEngine: "0x0000000000000000000000000000000000000000",
            trustRegistry: "0x0000000000000000000000000000000000000000",
            intentAttestation: "0x0000000000000000000000000000000000000000",
            settlementCoordinator: "0x0000000000000000000000000000000000000000",
        },
    },
};
var AgreementStatus;
(function (AgreementStatus) {
    AgreementStatus[AgreementStatus["PROPOSED"] = 0] = "PROPOSED";
    AgreementStatus[AgreementStatus["ACCEPTED"] = 1] = "ACCEPTED";
    AgreementStatus[AgreementStatus["PENDING_VERIFICATION"] = 2] = "PENDING_VERIFICATION";
    AgreementStatus[AgreementStatus["FULFILLED"] = 3] = "FULFILLED";
    AgreementStatus[AgreementStatus["DISPUTED"] = 4] = "DISPUTED";
    AgreementStatus[AgreementStatus["CANCELLED"] = 5] = "CANCELLED";
    AgreementStatus[AgreementStatus["REVISION_REQUESTED"] = 6] = "REVISION_REQUESTED";
    AgreementStatus[AgreementStatus["REVISED"] = 7] = "REVISED";
    AgreementStatus[AgreementStatus["PARTIAL_SETTLEMENT"] = 8] = "PARTIAL_SETTLEMENT";
    AgreementStatus[AgreementStatus["MUTUAL_CANCEL"] = 9] = "MUTUAL_CANCEL";
    AgreementStatus[AgreementStatus["ESCALATED_TO_HUMAN"] = 10] = "ESCALATED_TO_HUMAN";
    AgreementStatus[AgreementStatus["ESCALATED_TO_ARBITRATION"] = 11] = "ESCALATED_TO_ARBITRATION";
})(AgreementStatus || (exports.AgreementStatus = AgreementStatus = {}));
var ProviderResponseType;
(function (ProviderResponseType) {
    ProviderResponseType[ProviderResponseType["NONE"] = 0] = "NONE";
    ProviderResponseType[ProviderResponseType["REVISE"] = 1] = "REVISE";
    ProviderResponseType[ProviderResponseType["DEFEND"] = 2] = "DEFEND";
    ProviderResponseType[ProviderResponseType["COUNTER"] = 3] = "COUNTER";
    ProviderResponseType[ProviderResponseType["PARTIAL_SETTLEMENT"] = 4] = "PARTIAL_SETTLEMENT";
    ProviderResponseType[ProviderResponseType["REQUEST_HUMAN_REVIEW"] = 5] = "REQUEST_HUMAN_REVIEW";
    ProviderResponseType[ProviderResponseType["ESCALATE"] = 6] = "ESCALATE";
})(ProviderResponseType || (exports.ProviderResponseType = ProviderResponseType = {}));
var DisputeOutcome;
(function (DisputeOutcome) {
    DisputeOutcome[DisputeOutcome["NONE"] = 0] = "NONE";
    DisputeOutcome[DisputeOutcome["PENDING"] = 1] = "PENDING";
    DisputeOutcome[DisputeOutcome["PROVIDER_WINS"] = 2] = "PROVIDER_WINS";
    DisputeOutcome[DisputeOutcome["CLIENT_REFUND"] = 3] = "CLIENT_REFUND";
    DisputeOutcome[DisputeOutcome["PARTIAL_PROVIDER"] = 4] = "PARTIAL_PROVIDER";
    DisputeOutcome[DisputeOutcome["PARTIAL_CLIENT"] = 5] = "PARTIAL_CLIENT";
    DisputeOutcome[DisputeOutcome["MUTUAL_CANCEL"] = 6] = "MUTUAL_CANCEL";
    DisputeOutcome[DisputeOutcome["HUMAN_REVIEW_REQUIRED"] = 7] = "HUMAN_REVIEW_REQUIRED";
})(DisputeOutcome || (exports.DisputeOutcome = DisputeOutcome = {}));
var EvidenceType;
(function (EvidenceType) {
    EvidenceType[EvidenceType["NONE"] = 0] = "NONE";
    EvidenceType[EvidenceType["TRANSCRIPT"] = 1] = "TRANSCRIPT";
    EvidenceType[EvidenceType["DELIVERABLE"] = 2] = "DELIVERABLE";
    EvidenceType[EvidenceType["ACCEPTANCE_CRITERIA"] = 3] = "ACCEPTANCE_CRITERIA";
    EvidenceType[EvidenceType["COMMUNICATION"] = 4] = "COMMUNICATION";
    EvidenceType[EvidenceType["EXTERNAL_REFERENCE"] = 5] = "EXTERNAL_REFERENCE";
    EvidenceType[EvidenceType["OTHER"] = 6] = "OTHER";
})(EvidenceType || (exports.EvidenceType = EvidenceType = {}));
var DirectDisputeReason;
(function (DirectDisputeReason) {
    DirectDisputeReason[DirectDisputeReason["NONE"] = 0] = "NONE";
    DirectDisputeReason[DirectDisputeReason["NO_DELIVERY"] = 1] = "NO_DELIVERY";
    DirectDisputeReason[DirectDisputeReason["HARD_DEADLINE_BREACH"] = 2] = "HARD_DEADLINE_BREACH";
    DirectDisputeReason[DirectDisputeReason["INVALID_OR_FRAUDULENT_DELIVERABLE"] = 3] = "INVALID_OR_FRAUDULENT_DELIVERABLE";
    DirectDisputeReason[DirectDisputeReason["SAFETY_CRITICAL_VIOLATION"] = 4] = "SAFETY_CRITICAL_VIOLATION";
})(DirectDisputeReason || (exports.DirectDisputeReason = DirectDisputeReason = {}));
var ArbitrationVote;
(function (ArbitrationVote) {
    ArbitrationVote[ArbitrationVote["NONE"] = 0] = "NONE";
    ArbitrationVote[ArbitrationVote["PROVIDER_WINS"] = 1] = "PROVIDER_WINS";
    ArbitrationVote[ArbitrationVote["CLIENT_REFUND"] = 2] = "CLIENT_REFUND";
    ArbitrationVote[ArbitrationVote["SPLIT"] = 3] = "SPLIT";
    ArbitrationVote[ArbitrationVote["HUMAN_REVIEW_REQUIRED"] = 4] = "HUMAN_REVIEW_REQUIRED";
})(ArbitrationVote || (exports.ArbitrationVote = ArbitrationVote = {}));
var ReputationSignalType;
(function (ReputationSignalType) {
    ReputationSignalType[ReputationSignalType["ENDORSE"] = 0] = "ENDORSE";
    ReputationSignalType[ReputationSignalType["WARN"] = 1] = "WARN";
    ReputationSignalType[ReputationSignalType["BLOCK"] = 2] = "BLOCK";
})(ReputationSignalType || (exports.ReputationSignalType = ReputationSignalType = {}));
var IdentityTier;
(function (IdentityTier) {
    IdentityTier[IdentityTier["NONE"] = 0] = "NONE";
    IdentityTier[IdentityTier["SPONSORED"] = 1] = "SPONSORED";
    IdentityTier[IdentityTier["VERIFIED_PROVIDER"] = 2] = "VERIFIED_PROVIDER";
    IdentityTier[IdentityTier["ENTERPRISE_PROVIDER"] = 3] = "ENTERPRISE_PROVIDER";
})(IdentityTier || (exports.IdentityTier = IdentityTier = {}));
// ─── DisputeArbitration types ─────────────────────────────────────────────────
var DisputeMode;
(function (DisputeMode) {
    DisputeMode[DisputeMode["UNILATERAL"] = 0] = "UNILATERAL";
    DisputeMode[DisputeMode["MUTUAL"] = 1] = "MUTUAL";
})(DisputeMode || (exports.DisputeMode = DisputeMode = {}));
var DisputeClass;
(function (DisputeClass) {
    DisputeClass[DisputeClass["HARD_FAILURE"] = 0] = "HARD_FAILURE";
    DisputeClass[DisputeClass["AMBIGUITY_QUALITY"] = 1] = "AMBIGUITY_QUALITY";
    DisputeClass[DisputeClass["HIGH_SENSITIVITY"] = 2] = "HIGH_SENSITIVITY";
})(DisputeClass || (exports.DisputeClass = DisputeClass = {}));
//# sourceMappingURL=types.js.map