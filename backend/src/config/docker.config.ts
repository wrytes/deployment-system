import { registerAs } from '@nestjs/config';

export default registerAs('docker', () => ({
  socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
  swarmAdvertiseAddr: process.env.DOCKER_SWARM_ADVERTISE_ADDR,
  nginxContainerName: process.env.NGINX_CONTAINER_NAME || 'nginx_proxy',
}));
