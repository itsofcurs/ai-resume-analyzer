import urllib.request
import json

url = "https://talentai-python-service.onrender.com/openapi.json"
try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        paths = data.get("paths", {})
        for path in paths:
            print(path)
except Exception as e:
    print("Error:", e)
