#!/bin/bash

echo "Starting network attachment monitor..."

CONTAINER_NAME="${NGINX_CONTAINER_NAME:-nginx_proxy}"

while true; do
    # Find all overlay networks managed by deployment platform
    NETWORKS=$(docker network ls --filter "label=com.deployment-platform.managed=true" --filter "driver=overlay" --format "{{.Name}}")

    for NETWORK in $NETWORKS; do
        # Check if network should be public
        IS_PUBLIC=$(docker network inspect "$NETWORK" -f '{{index .Labels "com.deployment-platform.public"}}' 2>/dev/null || echo "")

        if [ "$IS_PUBLIC" = "true" ]; then
            # Check if nginx is already attached to this network
            ATTACHED=$(docker network inspect "$NETWORK" -f '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -w "$CONTAINER_NAME" || echo "")

            if [ -z "$ATTACHED" ]; then
                echo "Attaching $CONTAINER_NAME to network $NETWORK"
                docker network connect "$NETWORK" "$CONTAINER_NAME" 2>/dev/null || true
            fi
        fi
    done

    # Sleep for 30 seconds before next check
    sleep 30
done
