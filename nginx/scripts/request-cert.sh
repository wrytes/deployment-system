#!/bin/bash
set -e

DOMAIN=$1
EMAIL=$2
STAGING=${3:-true}

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: $0 <domain> <email> [staging]"
    exit 1
fi

echo "Requesting SSL certificate for $DOMAIN"

CERT_ARGS="--nginx --email $EMAIL --agree-tos --non-interactive"

if [ "$STAGING" = "true" ]; then
    CERT_ARGS="$CERT_ARGS --staging"
fi

# Request certificate
certbot certonly \
    $CERT_ARGS \
    -d "$DOMAIN" \
    --webroot \
    -w /var/www/certbot

echo "Certificate requested successfully for $DOMAIN"

# Reload nginx to use new certificate
nginx -s reload
