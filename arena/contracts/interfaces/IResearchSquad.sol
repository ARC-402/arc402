// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IResearchSquad
 * @notice Shared interface for ResearchSquad used by SquadBriefing.
 *
 *         Defining this in a single canonical file prevents silent enum-ordering
 *         mismatches if ResearchSquad.Role ever changes.
 */
interface IResearchSquad {
    enum Role { Contributor, Lead }

    function isMember(uint256 squadId, address agent) external view returns (bool);
    function getMemberRole(uint256 squadId, address member) external view returns (Role);
}
