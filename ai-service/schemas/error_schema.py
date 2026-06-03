"""
schemas/error_schema.py
-----------------------
Standard error response model.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ErrorResponseSchema(BaseModel):
    detail: str
    error_code: Optional[str] = Field(default=None)
    request_id: Optional[str] = Field(default=None)
