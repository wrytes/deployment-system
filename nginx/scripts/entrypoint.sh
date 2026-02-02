#!/bin/bash
set -e

echo "Starting Nginx reverse proxy..."

# Start nginx in the background
nginx -g "daemon off;" &
NGINX_PID=$!

echo "Nginx started with PID: $NGINX_PID"

# Start network attachment loop in background
/scripts/attach-networks.sh &

# Wait for nginx process
wait $NGINX_PID
