import urllib.request
import json

url = "https://talentai-python-service.onrender.com/api/health"

req = urllib.request.Request(url, method="GET")

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Error Response:", e.read().decode())
except Exception as e:
    print("Error:", e)
