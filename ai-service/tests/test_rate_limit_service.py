import time

from services.rate_limit_service import RateLimitService


def test_rate_limit_blocks_after_limit():
    rl = RateLimitService(invalid_threshold=5, invalid_block_seconds=60)
    key = "1.2.3.4:/api/job-match"
    for _ in range(3):
        assert rl.allow(key, limit=3, window_seconds=60) is True
    assert rl.allow(key, limit=3, window_seconds=60) is False


def test_invalid_payload_blocking():
    rl = RateLimitService(invalid_threshold=2, invalid_block_seconds=1)
    key = "1.2.3.4:/api/job-match"
    assert rl.record_invalid(key) is False
    assert rl.record_invalid(key) is True  # triggers block
    assert rl.allow(key, limit=100, window_seconds=60) is False
    time.sleep(1.1)
    assert rl.allow(key, limit=100, window_seconds=60) is True
