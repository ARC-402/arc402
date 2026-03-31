// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title SquadRevenueSplit
 * @notice Autonomous revenue distribution for research squads.
 *         Revenue flows in (ETH or USDC), splits automatically to contributors.
 *         No LEAD action required after deployment. Fully on-chain enforcement.
 *
 *         Shares are expressed in basis points (10000 = 100%).
 *         Shares are immutable after deployment.
 *
 *         ETH:  auto-distributed via receive() — attempted push per recipient.
 *               On push failure (e.g. recipient contract reverts), the share is
 *               accumulated in pendingETH[recipient] for later claim via claimETH().
 *               This prevents a single bad recipient from blocking all others.
 *         USDC: distributed via receiveUSDC() (pull from caller) or distribute() sweep.
 *               On transfer failure, share accumulates in pendingUSDC[recipient].
 *         Both: distribute() sweeps any accumulated ETH and USDC balances.
 *
 *         Security:
 *         - CEI pattern throughout
 *         - Inline ReentrancyGuard on all value-transferring functions
 *         - Shares immutable after deployment
 *         - Failed transfers accumulate in pending mappings (no permanent lock)
 *         - Custom errors only
 *
 * @dev    Solidity 0.8.24 · no via_ir · no upgradeable proxy
 */
contract SquadRevenueSplit {

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAddress();
    error EmptyRecipients();
    error SharesMismatch();
    error SharesNotSumTo10000();
    error ZeroShare();
    error TransferFailed();
    error ZeroAmount();
    error NothingToDistribute();
    error NothingPending();
    error Reentrancy();

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when revenue is received and queued for distribution.
    event RevenueReceived(uint256 amount, address indexed token);

    /// @notice Emitted for each recipient when ETH is pushed successfully.
    event ETHDistributed(address indexed recipient, uint256 amount);

    /// @notice Emitted for each recipient when USDC is pushed successfully.
    event USDCDistributed(address indexed recipient, uint256 amount);

    /// @notice Emitted when ETH push fails; share held in pendingETH[recipient].
    event ETHPushFailed(address indexed recipient, uint256 amount);

    /// @notice Emitted when USDC push fails; share held in pendingUSDC[recipient].
    event USDCPushFailed(address indexed recipient, uint256 amount);

    /// @notice Emitted when a recipient claims their accumulated ETH.
    event ETHClaimed(address indexed recipient, uint256 amount);

    /// @notice Emitted when a recipient claims their accumulated USDC.
    event USDCClaimed(address indexed recipient, uint256 amount);

    // ─── Constants ────────────────────────────────────────────────────────────

    address public constant ETH_TOKEN  = address(0);
    uint256 public constant BASIS_POINTS = 10_000;

    // ─── Immutables ───────────────────────────────────────────────────────────

    /// @notice USDC contract address (Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
    address public immutable USDC;

    // ─── State ────────────────────────────────────────────────────────────────

    address[] private _recipients;
    uint256[] private _shares;

    /// @notice Accumulated ETH for recipients whose push failed.
    mapping(address => uint256) public pendingETH;

    /// @notice Accumulated USDC for recipients whose push failed.
    mapping(address => uint256) public pendingUSDC;

    // Inline reentrancy guard
    uint256 private _locked;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address[] memory _recips,
        uint256[] memory _bps,
        address _usdc,
        address _agentRegistry  // retained for interface compatibility; not used on-chain
    ) {
        if (_usdc == address(0))            revert ZeroAddress();
        if (_agentRegistry == address(0))   revert ZeroAddress();
        if (_recips.length == 0)            revert EmptyRecipients();
        if (_recips.length != _bps.length)  revert SharesMismatch();

        uint256 total;
        for (uint256 i = 0; i < _recips.length; i++) {
            if (_recips[i] == address(0)) revert ZeroAddress();
            if (_bps[i] == 0)            revert ZeroShare();
            total += _bps[i];
        }
        if (total != BASIS_POINTS) revert SharesNotSumTo10000();

        USDC = _usdc;

        for (uint256 i = 0; i < _recips.length; i++) {
            _recipients.push(_recips[i]);
            _shares.push(_bps[i]);
        }

        _locked = 1;
    }

    // ─── Modifier ─────────────────────────────────────────────────────────────

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ─── ETH: auto-distribute on receipt ─────────────────────────────────────

    /**
     * @notice Receives ETH and immediately attempts to distribute it proportionally.
     *         If any recipient's push fails (e.g. contract rejects ETH), that
     *         share is held in pendingETH[recipient] — other recipients are unaffected.
     *         CEI: emit RevenueReceived (effect) before transfers (interactions).
     */
    receive() external payable nonReentrant {
        uint256 amount = msg.value;
        if (amount == 0) revert ZeroAmount();
        emit RevenueReceived(amount, ETH_TOKEN);
        _distributeETH(amount);
    }

    // ─── USDC: pull-and-distribute ────────────────────────────────────────────

    /**
     * @notice Pull `amount` USDC from msg.sender and distribute to recipients.
     *         Caller must approve this contract for `amount` USDC before calling.
     *         Intended for protocol integrations (e.g. ServiceAgreement settlement).
     *
     * @param amount  Amount of USDC (6 decimals) to pull and distribute.
     */
    function receiveUSDC(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        bool ok = _safeTransferFrom(USDC, msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        emit RevenueReceived(amount, USDC);
        _distributeUSDC(amount);
    }

    // ─── Sweep: distribute any accumulated ETH + USDC ─────────────────────────

    /**
     * @notice Sweep any ETH or USDC held in this contract and distribute both.
     *         Permissionless — anyone can call to trigger distribution.
     *         Reverts only if both ETH and USDC balances are zero.
     */
    function distribute() external nonReentrant {
        uint256 ethBalance  = address(this).balance;
        uint256 usdcBalance = _balanceOf(USDC, address(this));

        if (ethBalance == 0 && usdcBalance == 0) revert NothingToDistribute();

        if (ethBalance > 0) {
            emit RevenueReceived(ethBalance, ETH_TOKEN);
            _distributeETH(ethBalance);
        }

        if (usdcBalance > 0) {
            emit RevenueReceived(usdcBalance, USDC);
            _distributeUSDC(usdcBalance);
        }
    }

    // ─── Claim: for recipients whose push failed ──────────────────────────────

    /**
     * @notice Claim any accumulated ETH that failed to push during distribution.
     *         Pull-pattern fallback for contract recipients that reject ETH.
     */
    function claimETH() external nonReentrant {
        uint256 amount = pendingETH[msg.sender];
        if (amount == 0) revert NothingPending();
        pendingETH[msg.sender] = 0;
        emit ETHClaimed(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /**
     * @notice Claim any accumulated USDC that failed to push during distribution.
     */
    function claimUSDC() external nonReentrant {
        uint256 amount = pendingUSDC[msg.sender];
        if (amount == 0) revert NothingPending();
        pendingUSDC[msg.sender] = 0;
        emit USDCClaimed(msg.sender, amount);
        bool ok = _safeTransfer(USDC, msg.sender, amount);
        if (!ok) revert TransferFailed();
    }

    // ─── Internal distribution logic ─────────────────────────────────────────

    /**
     * @dev Splits `total` ETH by shares. Last recipient absorbs rounding dust.
     *      On push failure, share accumulated in pendingETH[recipient].
     *      Emits ETHDistributed on success, ETHPushFailed on failure.
     */
    function _distributeETH(uint256 total) internal {
        uint256 len = _recipients.length;
        uint256 distributed;

        for (uint256 i = 0; i < len; i++) {
            uint256 share;
            if (i == len - 1) {
                share = total - distributed;
            } else {
                share = (total * _shares[i]) / BASIS_POINTS;
            }
            distributed += share;

            (bool ok,) = _recipients[i].call{value: share}("");
            if (ok) {
                emit ETHDistributed(_recipients[i], share);
            } else {
                pendingETH[_recipients[i]] += share;
                emit ETHPushFailed(_recipients[i], share);
            }
        }
    }

    /**
     * @dev Splits `total` USDC by shares. Last recipient absorbs rounding dust.
     *      On push failure, share accumulated in pendingUSDC[recipient].
     *      Emits USDCDistributed on success, USDCPushFailed on failure.
     */
    function _distributeUSDC(uint256 total) internal {
        uint256 len = _recipients.length;
        uint256 distributed;

        for (uint256 i = 0; i < len; i++) {
            uint256 share;
            if (i == len - 1) {
                share = total - distributed;
            } else {
                share = (total * _shares[i]) / BASIS_POINTS;
            }
            distributed += share;

            bool ok = _safeTransfer(USDC, _recipients[i], share);
            if (ok) {
                emit USDCDistributed(_recipients[i], share);
            } else {
                pendingUSDC[_recipients[i]] += share;
                emit USDCPushFailed(_recipients[i], share);
            }
        }
    }

    // ─── ERC-20 helpers (no lib dependency) ──────────────────────────────────

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal returns (bool) {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal returns (bool) {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _balanceOf(address token, address account) internal view returns (uint256) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        if (!success || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function recipients() external view returns (address[] memory) {
        return _recipients;
    }

    function shares() external view returns (uint256[] memory) {
        return _shares;
    }

    function recipientCount() external view returns (uint256) {
        return _recipients.length;
    }

    /// @notice Returns the basis-point share for a given recipient (0 if not found).
    function getShare(address recipient) external view returns (uint256) {
        uint256 len = _recipients.length;
        for (uint256 i = 0; i < len; i++) {
            if (_recipients[i] == recipient) return _shares[i];
        }
        return 0;
    }
}
