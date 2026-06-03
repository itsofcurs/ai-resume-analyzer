import multiprocessing

bind = "0.0.0.0:8001"
workers = max(2, multiprocessing.cpu_count() // 2)
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 120
keepalive = 5
