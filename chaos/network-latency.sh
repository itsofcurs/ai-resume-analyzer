#!/bin/bash
# Simulates Network Latency using tc (traffic control)
# Note: This is for local docker networks or Linux host only.

INTERFACE="eth0"
LATENCY="500ms"

if [ "$1" == "clean" ]; then
    echo "🧼 Cleaning up network latency on $INTERFACE"
    tc qdisc del dev $INTERFACE root 2>/dev/null
    exit 0
fi

echo "⚠️ Injecting Chaos: Adding $LATENCY latency to $INTERFACE"
tc qdisc add dev $INTERFACE root netem delay $LATENCY

echo "Added latency. Run './network-latency.sh clean' to revert."
