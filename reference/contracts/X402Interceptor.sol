// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title X402Interceptor
 * @notice Bridges x402 HTTP payment protocol with ARC-402 governance.
 *         When an agent receives a 402 Payment Required response,
 *         it calls this contract to execute a governed USDC payment.
 *
 * Flow:
 *   1. Agent hits an API endpoint → receives HTTP 402 with payment details
 *   2. Agent pre-creates an ARC-402 intent attestation (the "why")
 *   3. Agent calls executeX402Payment() with recipient, amount, attestationId
 *   4. This contract calls arc402Wallet.executeTokenSpend() — policy enforced
 *   5. USDC transfer executes on-chain; attestation is immutable audit record
 *
 * STATUS: DRAFT — not audited, do not use in production
 */
contract X402Interceptor {
    address public immutable arc402Wallet;
    address public immutable usdcToken;

    event X402PaymentExecuted(
        address indexed recipient,
        uint256 amount,
        bytes32 attestationId,
        string requestUrl
    );

    constructor(address _arc402Wallet, address _usdcToken) {
        require(_arc402Wallet != address(0), "X402: zero wallet address");
        require(_usdcToken != address(0), "X402: zero token address");
        arc402Wallet = _arc402Wallet;
        usdcToken = _usdcToken;
    }

    /**
     * @notice Execute an x402 payment through ARC-402 governance
     * @param recipient Payment recipient from the 402 response
     * @param amount USDC amount (6 decimals)
     * @param attestationId Pre-created ARC-402 intent attestation
     * @param requestUrl The URL that returned 402 (for audit trail)
     */
    function executeX402Payment(
        address recipient,
        uint256 amount,
        bytes32 attestationId,
        string calldata requestUrl
    ) external {
        IARC402Wallet(arc402Wallet).executeTokenSpend(
            usdcToken,
            recipient,
            amount,
            "api_call",
            attestationId
        );
        emit X402PaymentExecuted(recipient, amount, attestationId, requestUrl);
    }
}

interface IARC402Wallet {
    function executeTokenSpend(
        address token,
        address recipient,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external;
}
