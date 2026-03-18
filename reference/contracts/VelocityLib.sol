// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VelocityLib
 * @notice Internal library for two-bucket rolling velocity window logic.
 * @dev MA-05 FIX: two-bucket approach limits worst-case boundary spend to 1.5×
 *      per-bucket limit instead of 2× with a discrete single-bucket reset.
 */
library VelocityLib {

    uint256 internal constant VELOCITY_BUCKET_DURATION = 43200; // 12 hours

    struct Bucket {
        uint256 bucketStart;
        uint256 curEth;
        uint256 prevEth;
        uint256 curToken;
        uint256 prevToken;
    }

    /// @dev Advance the two-bucket rolling window if needed.
    ///      - If one bucket has elapsed: rotate current → previous, reset current.
    ///      - If two buckets have elapsed: full reset (previous also zeroed).
    ///
    ///      F-11 FIX: On single-bucket rotation, advance bucketStart by VELOCITY_BUCKET_DURATION
    ///      (aligned step) instead of setting it to block.timestamp. Using block.timestamp on
    ///      rotation drifts the window start, causing the effective window to be up to
    ///      3× VELOCITY_BUCKET_DURATION instead of 2×. This now matches PolicyEngine's
    ///      _recordBucketSpend which does `currentBucketStart += BUCKET_DURATION`.
    ///      On double-advance (no activity for 2+ buckets) we reset to block.timestamp since
    ///      the old boundary is stale and continuity no longer matters.
    function advance(Bucket storage v) internal {
        if (block.timestamp >= v.bucketStart + VELOCITY_BUCKET_DURATION) {
            if (block.timestamp >= v.bucketStart + 2 * VELOCITY_BUCKET_DURATION) {
                // Full reset — no activity for 2+ buckets; restart boundary from now
                v.prevEth = 0;
                v.prevToken = 0;
                v.bucketStart = block.timestamp;
            } else {
                // Single rotation — advance boundary by one fixed step (aligned)
                v.prevEth = v.curEth;
                v.prevToken = v.curToken;
                v.bucketStart = v.bucketStart + VELOCITY_BUCKET_DURATION;
            }
            v.curEth = 0;
            v.curToken = 0;
        }
    }

    /// @dev Returns effective ETH spending in the current rolling window (cur + prev).
    function effectiveEth(Bucket storage v) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - v.bucketStart;
        if (elapsed >= 2 * VELOCITY_BUCKET_DURATION) return 0;
        if (elapsed >= VELOCITY_BUCKET_DURATION) return v.curEth;
        return v.curEth + v.prevEth;
    }

    /// @dev Returns effective token spending in the current rolling window (cur + prev).
    function effectiveToken(Bucket storage v) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - v.bucketStart;
        if (elapsed >= 2 * VELOCITY_BUCKET_DURATION) return 0;
        if (elapsed >= VELOCITY_BUCKET_DURATION) return v.curToken;
        return v.curToken + v.prevToken;
    }
}
