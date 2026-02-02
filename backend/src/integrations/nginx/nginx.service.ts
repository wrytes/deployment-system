import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DockerService } from '../docker/docker.service';
import { NetworkService } from '../docker/network.service';
import Docker from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class NginxService {
  private readonly logger = new Logger(NginxService.name);
  private readonly docker: Docker;
  private readonly nginxContainerName: string;

  constructor(
    private readonly dockerService: DockerService,
    private readonly networkService: NetworkService,
    private readonly configService: ConfigService,
  ) {
    this.docker = this.dockerService.getClient();
    this.nginxContainerName =
      this.configService.get<string>('docker.nginxContainerName') || 'nginx_proxy';
  }

  async configurePublicEndpoint(
    domain: string,
    serviceName: string,
    servicePort: number,
    networkName: string,
  ): Promise<void> {
    this.logger.log(
      `Configuring public endpoint for ${domain} -> ${serviceName}:${servicePort}`,
    );

    try {
      // Step 1: Attach nginx to overlay network
      await this.networkService.attachContainerToNetwork(
        this.nginxContainerName,
        networkName,
      );

      // Step 2: Mark network as public
      const network = this.docker.getNetwork(networkName);
      // Note: Docker doesn't support updating labels after creation
      // We rely on database state for public tracking

      // Step 3: Generate nginx configuration
      const nginxConfig = this.generateNginxConfig(
        domain,
        serviceName,
        servicePort,
      );

      // Step 4: Write configuration to nginx container
      await this.writeNginxConfig(domain, nginxConfig);

      // Step 5: Reload nginx
      await this.reloadNginx();

      // Step 6: Request SSL certificate
      await this.requestSSLCertificate(domain);

      this.logger.log(
        `Public endpoint configured successfully for ${domain}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure public endpoint: ${error.message}`,
      );
      throw error;
    }
  }

  async removePublicEndpoint(
    domain: string,
    networkName: string,
  ): Promise<void> {
    this.logger.log(`Removing public endpoint for ${domain}`);

    try {
      // Step 1: Remove nginx configuration
      await this.removeNginxConfig(domain);

      // Step 2: Reload nginx
      await this.reloadNginx();

      // Step 3: Check if we should detach from network
      // (only if no other services use this network)
      // For simplicity, we leave nginx attached - it doesn't hurt

      this.logger.log(`Public endpoint removed for ${domain}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove public endpoint: ${error.message}`,
      );
      throw error;
    }
  }

  private generateNginxConfig(
    domain: string,
    serviceName: string,
    servicePort: number,
  ): string {
    return `
# HTTP - redirect to HTTPS
server {
    listen 80;
    server_name ${domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name ${domain};

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://${serviceName}:${servicePort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
`;
  }

  private async writeNginxConfig(
    domain: string,
    config: string,
  ): Promise<void> {
    try {
      const container = this.docker.getContainer(this.nginxContainerName);

      // Create config file in container
      const configPath = `/etc/nginx/conf.d/${domain}.conf`;

      const exec = await container.exec({
        Cmd: ['sh', '-c', `cat > ${configPath}`],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
      });

      stream.write(config);
      stream.end();

      this.logger.log(`Nginx configuration written for ${domain}`);
    } catch (error) {
      this.logger.error(
        `Failed to write nginx config: ${error.message}`,
      );
      throw error;
    }
  }

  private async removeNginxConfig(domain: string): Promise<void> {
    try {
      const container = this.docker.getContainer(this.nginxContainerName);
      const configPath = `/etc/nginx/conf.d/${domain}.conf`;

      const exec = await container.exec({
        Cmd: ['rm', '-f', configPath],
        AttachStdout: true,
        AttachStderr: true,
      });

      await exec.start({ Detach: false });

      this.logger.log(`Nginx configuration removed for ${domain}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove nginx config: ${error.message}`,
      );
      throw error;
    }
  }

  private async reloadNginx(): Promise<void> {
    try {
      const container = this.docker.getContainer(this.nginxContainerName);

      const exec = await container.exec({
        Cmd: ['nginx', '-s', 'reload'],
        AttachStdout: true,
        AttachStderr: true,
      });

      await exec.start({ Detach: false });

      this.logger.log('Nginx reloaded successfully');
    } catch (error) {
      this.logger.error(`Failed to reload nginx: ${error.message}`);
      throw error;
    }
  }

  private async requestSSLCertificate(domain: string): Promise<void> {
    try {
      const container = this.docker.getContainer(this.nginxContainerName);

      const email =
        this.configService.get<string>('ssl.letsencryptEmail') ||
        'admin@example.com';
      const staging = this.configService.get<boolean>(
        'ssl.letsencryptStaging',
        true,
      );

      const exec = await container.exec({
        Cmd: [
          '/scripts/request-cert.sh',
          domain,
          email,
          staging ? 'true' : 'false',
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });

      // Log output
      stream.on('data', (chunk) => {
        this.logger.debug(`SSL: ${chunk.toString()}`);
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      this.logger.log(`SSL certificate requested for ${domain}`);
    } catch (error) {
      this.logger.warn(
        `Failed to request SSL certificate for ${domain}: ${error.message}`,
      );
      // Don't throw - SSL is optional for development
    }
  }
}
