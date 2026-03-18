// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title P256VerifierLib
/// @notice Library for P256 (secp256r1) signature verification via the Base RIP-7212 precompile.
///         Also contains WebAuthn clientDataJSON challenge extraction helpers.
///         Extracted from ARC402Wallet to keep the main contract under the EIP-170 24,576-byte limit.
library P256VerifierLib {
    address internal constant VERIFIER    = 0x0000000000000000000000000000000000000100;
    uint256 internal constant SIG_VALID   = 0;
    uint256 internal constant SIG_INVALID = 1;

    // F-13: P256 (secp256r1) curve order n. Used for low-s normalization.
    // For any valid signature (r, s), the signature (r, n-s) is also valid (signature malleability).
    // Enforcing s <= n/2 ensures canonical form, preventing off-chain deduplication issues.
    uint256 internal constant P256_N =
        0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    /// @notice Verify a compact P256 signature against a message hash and public key.
    /// @param hash      The 32-byte message hash that was signed.
    /// @param signature 64-byte compact signature: r (32 bytes) || s (32 bytes).
    /// @param pubKeyX   P256 public key x coordinate.
    /// @param pubKeyY   P256 public key y coordinate.
    /// @return SIG_VALID (0) on success, SIG_INVALID (1) on failure or precompile absent.
    function validateP256Signature(
        bytes32 hash,
        bytes memory signature,
        bytes32 pubKeyX,
        bytes32 pubKeyY
    ) internal view returns (uint256) {
        if (signature.length != 64) return SIG_INVALID;
        bytes32 r;
        bytes32 s;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
        }
        // F-13: Enforce low-s normalization. For P256, if s > n/2, the signature is in
        // "high-s" form and is malleable: (r, n-s) is an equally valid signature for the
        // same message. Reject high-s signatures to enforce canonical form.
        // ERC-4337 nonces prevent replay, but canonical-s simplifies off-chain indexing.
        if (uint256(s) > P256_N / 2) return SIG_INVALID;

        // RIP-7212 input: hash (32) || r (32) || s (32) || x (32) || y (32) = 160 bytes
        bytes memory input = abi.encodePacked(hash, r, s, pubKeyX, pubKeyY);
        (bool success, bytes memory result) = VERIFIER.staticcall(input);
        if (!success || result.length < 32) return SIG_INVALID;
        return abi.decode(result, (uint256)) == 1 ? SIG_VALID : SIG_INVALID;
    }

    // ─── WebAuthn challenge extraction ───────────────────────────────────────

    /// @dev Decode a single base64url character to its 6-bit value.
    ///      Returns (value, true) for valid chars, (0, false) for invalid.
    function _b64v(uint8 c) internal pure returns (uint8 v, bool ok) {
        if (c >= 65 && c <= 90)  return (c - 65,     true);  // A-Z → 0-25
        if (c >= 97 && c <= 122) return (c - 71,     true);  // a-z → 26-51
        if (c >= 48 && c <= 57)  return (c + 4,      true);  // 0-9 → 52-61
        if (c == 45)             return (62,          true);  // '-'
        if (c == 95)             return (63,          true);  // '_'
        return (0, false);
    }

    /// @notice Base64url-decode exactly 43 chars to bytes32.
    ///         43 base64url chars encode exactly 32 bytes (256 bits, no padding).
    ///         Returns bytes32(0) on wrong length or any invalid character.
    function base64urlToBytes32(bytes memory enc) internal pure returns (bytes32 result) {
        if (enc.length != 43) return bytes32(0);
        bytes memory out = new bytes(32);
        // 10 full 4-char groups → 30 bytes
        for (uint256 i = 0; i < 10; ++i) {
            (uint8 a, bool va) = _b64v(uint8(enc[i * 4]));
            (uint8 b, bool vb) = _b64v(uint8(enc[i * 4 + 1]));
            (uint8 c, bool vc) = _b64v(uint8(enc[i * 4 + 2]));
            (uint8 d, bool vd) = _b64v(uint8(enc[i * 4 + 3]));
            if (!va || !vb || !vc || !vd) return bytes32(0);
            out[i * 3]     = bytes1(uint8((a << 2) | (b >> 4)));
            out[i * 3 + 1] = bytes1(uint8(((b & 0x0F) << 4) | (c >> 2)));
            out[i * 3 + 2] = bytes1(uint8(((c & 0x03) << 6) | d));
        }
        // Last 3-char group → 2 bytes (encodes final 16 bits; lower 2 bits of last char are padding zeros)
        (uint8 a, bool va) = _b64v(uint8(enc[40]));
        (uint8 b, bool vb) = _b64v(uint8(enc[41]));
        (uint8 c, bool vc) = _b64v(uint8(enc[42]));
        if (!va || !vb || !vc) return bytes32(0);
        out[30] = bytes1(uint8((a << 2) | (b >> 4)));
        out[31] = bytes1(uint8(((b & 0x0F) << 4) | (c >> 2)));
        // solhint-disable-next-line no-inline-assembly
        assembly { result := mload(add(out, 32)) }
    }

    /// @notice Extract and decode the WebAuthn challenge from clientDataJSON bytes.
    ///         Searches for the literal `"challenge":"` marker (13 bytes) and
    ///         base64url-decodes the immediately following 43 characters.
    ///         Returns bytes32(0) if the marker is absent, the JSON is too short,
    ///         or any base64url character in the challenge is invalid.
    function extractChallenge(bytes memory clientDataJSON) internal pure returns (bytes32) {
        uint256 jsonLen = clientDataJSON.length;
        // Need at least 13 (needle) + 43 (challenge) = 56 bytes
        if (jsonLen < 56) return bytes32(0);
        uint256 limit = jsonLen - 55; // largest i such that i+55 <= jsonLen-1
        for (uint256 i = 0; i < limit; ++i) {
            // Match '"challenge":"' — 13 ASCII bytes
            if (
                clientDataJSON[i]      == 0x22 &&  // "
                clientDataJSON[i +  1] == 0x63 &&  // c
                clientDataJSON[i +  2] == 0x68 &&  // h
                clientDataJSON[i +  3] == 0x61 &&  // a
                clientDataJSON[i +  4] == 0x6C &&  // l
                clientDataJSON[i +  5] == 0x6C &&  // l
                clientDataJSON[i +  6] == 0x65 &&  // e
                clientDataJSON[i +  7] == 0x6E &&  // n
                clientDataJSON[i +  8] == 0x67 &&  // g
                clientDataJSON[i +  9] == 0x65 &&  // e
                clientDataJSON[i + 10] == 0x22 &&  // "
                clientDataJSON[i + 11] == 0x3A &&  // :
                clientDataJSON[i + 12] == 0x22      // "
            ) {
                bytes memory encoded = new bytes(43);
                for (uint256 k = 0; k < 43; ++k) {
                    encoded[k] = clientDataJSON[i + 13 + k];
                }
                return base64urlToBytes32(encoded);
            }
        }
        return bytes32(0);
    }
}
