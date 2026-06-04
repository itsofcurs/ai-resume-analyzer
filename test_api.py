import urllib.request
import json

url = "https://talentai-python-service.onrender.com/api/copilot/chat"
data = json.dumps({"query": "hello"}).encode("utf-8")
headers = {"Content-Type": "application/json"}

req = urllib.request.Request(url, data=data, headers=headers, method="POST")

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Error Response:", e.read().decode())
except Exception as e:
    print("Error:", e)
