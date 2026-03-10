// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIntentAttestation {
    function verify(bytes32 attestationId, address wallet) external view returns (bool);
}
