"""
core/errors.py
--------------
Typed error taxonomy for platform reliability.
"""

class ATSProcessingError(RuntimeError):
    """Raised when ATS processing fails irrecoverably."""


class EmbeddingError(RuntimeError):
    """Raised when embedding generation fails."""


class WorkflowTimeoutError(TimeoutError):
    """Raised when a workflow or stage exceeds its timeout."""


class InvalidResumeError(ValueError):
    """Raised when resume payloads are invalid or unsafe."""


class RecruiterValidationError(ValueError):
    """Raised for recruiter-facing validation failures."""


class CacheError(RuntimeError):
    """Raised when cache operations fail."""

