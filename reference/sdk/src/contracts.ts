import { Contract, ContractRunner } from "ethers"

const POLICY_ENGINE_ABI = [
  "function registerWallet(address wallet, address owner) external",
  "function setCategoryLimit(string calldata category, uint256 limitPerTx) external",
  "function setCategoryLimitFor(address wallet, string calldata category, uint256 limitPerTx) external",
  "function validateSpend(address wallet, string calldata category, uint256 amount, bytes32 contextId) external view returns (bool valid, string memory reason)",
  "function categoryLimits(address wallet, string category) external view returns (uint256)",
]

const TRUST_REGISTRY_ABI = [
  "function initWallet(address wallet) external",
  "function getScore(address wallet) external view returns (uint256)",
  "function getTrustLevel(address wallet) external view returns (string)",
  "function recordSuccess(address wallet) external",
  "function recordAnomaly(address wallet) external",
  "function addUpdater(address updater) external",
]

const INTENT_ATTESTATION_ABI = [
  "function attest(bytes32 attestationId, string calldata action, string calldata reason, address recipient, uint256 amount) external",
  "function verify(bytes32 attestationId, address wallet) external view returns (bool)",
  "function getAttestation(bytes32 attestationId) external view returns (bytes32 id, address wallet, string memory action, string memory reason, address recipient, uint256 amount, uint256 timestamp)",
]

const ARC402_WALLET_ABI = [
  "function openContext(bytes32 contextId, string calldata taskType) external",
  "function closeContext() external",
  "function executeSpend(address payable recipient, uint256 amount, string calldata category, bytes32 attestationId) external",
  "function updatePolicy(bytes32 newPolicyId) external",
  "function getTrustScore() external view returns (uint256)",
  "function getActiveContext() external view returns (bytes32, string memory, uint256, bool)",
  "function owner() external view returns (address)",
  "event SpendExecuted(address indexed recipient, uint256 amount, string category, bytes32 attestationId)",
  "event ContextOpened(bytes32 indexed contextId, string taskType, uint256 timestamp)",
  "event ContextClosed(bytes32 indexed contextId, uint256 timestamp)",
  "receive() external payable",
]

const SETTLEMENT_COORDINATOR_ABI = [
  "function propose(address fromWallet, address toWallet, uint256 amount, bytes32 intentId, uint256 expiresAt) external returns (bytes32 proposalId)",
  "function accept(bytes32 proposalId) external",
  "function reject(bytes32 proposalId, string calldata reason) external",
  "function execute(bytes32 proposalId) external payable",
  "function getProposal(bytes32 proposalId) external view returns (address fromWallet, address toWallet, uint256 amount, bytes32 intentId, uint256 expiresAt, uint8 status, string memory rejectionReason)",
]

export function getPolicyEngine(address: string, runner: ContractRunner) {
  return new Contract(address, POLICY_ENGINE_ABI, runner)
}

export function getTrustRegistry(address: string, runner: ContractRunner) {
  return new Contract(address, TRUST_REGISTRY_ABI, runner)
}

export function getIntentAttestation(address: string, runner: ContractRunner) {
  return new Contract(address, INTENT_ATTESTATION_ABI, runner)
}

export function getARC402Wallet(address: string, runner: ContractRunner) {
  return new Contract(address, ARC402_WALLET_ABI, runner)
}

export function getSettlementCoordinator(address: string, runner: ContractRunner) {
  return new Contract(address, SETTLEMENT_COORDINATOR_ABI, runner)
}

export {
  POLICY_ENGINE_ABI,
  TRUST_REGISTRY_ABI,
  INTENT_ATTESTATION_ABI,
  ARC402_WALLET_ABI,
  SETTLEMENT_COORDINATOR_ABI,
}
