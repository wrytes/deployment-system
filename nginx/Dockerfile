FROM nginx:alpine

# Install required packages
RUN apk add --no-cache \
    docker-cli \
    bash \
    certbot \
    certbot-nginx \
    openssl

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/

# Copy scripts
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

# Create directories
RUN mkdir -p /var/www/certbot \
    /etc/nginx/conf.d \
    /etc/letsencrypt

# Expose ports
EXPOSE 80 443

# Start with entrypoint script
ENTRYPOINT ["/scripts/entrypoint.sh"]
