// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IIntentAttestation.sol";

/**
 * @title IntentAttestation
 * @notice Immutable on-chain record of agent intent before spending
 * STATUS: DRAFT — not audited, do not use in production
 */
contract IntentAttestation is IIntentAttestation {
    struct Attestation {
        bytes32 attestationId;
        address wallet;
        string action;
        string reason;
        address recipient;
        uint256 amount;
        address token;      // address(0) for ETH, token address for ERC-20 (e.g. USDC)
        uint256 timestamp;
    }

    mapping(bytes32 => Attestation) private attestations;
    mapping(bytes32 => bool) private exists;

    event AttestationCreated(
        bytes32 indexed attestationId,
        address indexed wallet,
        string action,
        address recipient,
        uint256 amount,
        address token
    );

    function attest(
        bytes32 attestationId,
        string calldata action,
        string calldata reason,
        address recipient,
        uint256 amount,
        address token
    ) external {
        require(!exists[attestationId], "IntentAttestation: already exists");
        attestations[attestationId] = Attestation({
            attestationId: attestationId,
            wallet: msg.sender,
            action: action,
            reason: reason,
            recipient: recipient,
            amount: amount,
            token: token,
            timestamp: block.timestamp
        });
        exists[attestationId] = true;
        emit AttestationCreated(attestationId, msg.sender, action, recipient, amount, token);
    }

    function verify(bytes32 attestationId, address wallet) external view returns (bool) {
        return exists[attestationId] && attestations[attestationId].wallet == wallet;
    }

    function getAttestation(bytes32 attestationId) external view returns (
        bytes32 id,
        address wallet,
        string memory action,
        string memory reason,
        address recipient,
        uint256 amount,
        address token,
        uint256 timestamp
    ) {
        require(exists[attestationId], "IntentAttestation: not found");
        Attestation storage a = attestations[attestationId];
        return (a.attestationId, a.wallet, a.action, a.reason, a.recipient, a.amount, a.token, a.timestamp);
    }
}
