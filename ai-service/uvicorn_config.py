import multiprocessing

workers = max(1, multiprocessing.cpu_count() // 2)
timeout_keep_alive = 5
log_level = "info"
