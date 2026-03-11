# ARC-402 Token Addresses

Token addresses used with ARC-402 governed spending (`executeTokenSpend`) and x402 payment integration.

## USDC (USD Coin)

USDC is the primary token for x402 HTTP payment protocol integration. It has **6 decimals**.

| Network | Address |
|---------|---------|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia (testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Using with ARC-402

### Setting a USDC policy limit

```solidity
// Allow up to 5 USDC per x402 API call
wallet.policyEngine.setCategoryLimit("api_call", 5_000_000); // 5 USDC (6 decimals)
```

### Creating an x402 attestation

```solidity
bytes32 attestationId = keccak256(abi.encodePacked("x402", requestUrl, block.timestamp));
intentAttestation.attest(
    attestationId,
    "api_call",
    "Payment for <service> API access",
    recipient,     // from 402 response
    amount,        // in USDC units (6 decimals)
    USDC_ADDRESS   // Base Sepolia or Mainnet address above
);
```

### Executing via X402Interceptor

```solidity
X402Interceptor interceptor = new X402Interceptor(arc402WalletAddress, USDC_ADDRESS);
interceptor.executeX402Payment(recipient, amount, attestationId, requestUrl);
```

## address(0) Convention

`address(0)` is used throughout ARC-402 to denote native ETH (no ERC-20 token). All token fields that accept `address(0)` will route through ETH transfer paths.
