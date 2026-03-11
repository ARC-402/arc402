"""ARC-402 exception hierarchy."""


class ARC402Error(Exception):
    """Base exception for all ARC-402 errors."""


class PolicyViolation(ARC402Error):
    """Raised when a spend would violate the wallet's policy."""

    def __init__(self, message: str, category: str | None = None, amount: int | None = None):
        super().__init__(message)
        self.category = category
        self.amount = amount


class TrustInsufficient(ARC402Error):
    """Raised when the wallet's trust score is too low for the operation."""

    def __init__(self, message: str, score: int | None = None, required: int | None = None):
        super().__init__(message)
        self.score = score
        self.required = required


class ContextAlreadyOpen(ARC402Error):
    """Raised when trying to open a context while one is already active."""


class ContextNotOpen(ARC402Error):
    """Raised when trying to spend or close without an open context."""


class NetworkNotSupported(ARC402Error):
    """Raised when the requested network is not configured."""


class TransactionFailed(ARC402Error):
    """Raised when an on-chain transaction fails."""

    def __init__(self, message: str, tx_hash: str | None = None):
        super().__init__(message)
        self.tx_hash = tx_hash


class AttestationNotFound(ARC402Error):
    """Raised when an attestation cannot be found on-chain."""
