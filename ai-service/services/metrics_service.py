"""
services/metrics_service.py
---------------------------
Prometheus-compatible metrics registry and helpers.

This module exposes counters/histograms only (no recruiter PII).
"""

from __future__ import annotations

from prometheus_client import Counter, Histogram

API_REQUESTS = Counter(
    "ai_service_requests_total",
    "Total API requests",
    ["path", "method", "status"],
)

API_LATENCY = Histogram(
    "ai_service_request_latency_seconds",
    "API request latency in seconds",
    ["path", "method"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)

ATS_STAGE_LATENCY = Histogram(
    "ai_service_ats_stage_latency_seconds",
    "ATS stage latency in seconds",
    ["stage"],
    buckets=(0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)

CACHE_EVENTS = Counter(
    "ai_service_cache_events_total",
    "Cache events",
    ["backend", "event"],
)
