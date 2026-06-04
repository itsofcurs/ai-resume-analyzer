"""Fetch latest Render logs for both services."""
import urllib.request
import json

API_KEY = "rnd_XANXdktXp6ucnNV0CBJAvNcG28OQ"
NODE_ID = "srv-d8ghq1m47okc73fqpusg"
PYTHON_ID = "srv-d8ghk2t8nd3s7390qagg"

def fetch_deploy_logs(service_id, service_name):
    # Get latest deploy
    url = f"https://api.render.com/v1/services/{service_id}/deploys?limit=1"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Accept": "application/json"
    })
    res = urllib.request.urlopen(req)
    deploys = json.loads(res.read().decode())
    if not deploys:
        print(f"No deploys for {service_name}")
        return
    deploy_id = deploys[0]["deploy"]["id"]
    
    # Get logs for that deploy
    log_url = f"https://api.render.com/v1/services/{service_id}/deploys/{deploy_id}/logs"
    req2 = urllib.request.Request(log_url, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Accept": "application/json"
    })
    try:
        res2 = urllib.request.urlopen(req2)
        logs = json.loads(res2.read().decode())
        print(f"\n{'='*60}")
        print(f"  {service_name} — Deploy {deploy_id}")
        print(f"{'='*60}")
        for entry in logs[-30:]:
            ts = entry.get("log", {}).get("timestamp", "")
            msg = entry.get("log", {}).get("message", "")
            print(f"  {ts} | {msg}")
    except Exception as e:
        print(f"Error fetching logs for {service_name}: {e}")

fetch_deploy_logs(NODE_ID, "Node Backend")
fetch_deploy_logs(PYTHON_ID, "Python Service")
