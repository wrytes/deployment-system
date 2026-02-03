import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDevelopment = nodeEnv === 'development';
  const port = parseInt(process.env.PORT || '3030', 10);
  const virtualHost = process.env.VIRTUAL_HOST || 'localhost';
  const virtualPort = process.env.VIRTUAL_PORT || port.toString();

  // Construct base URL: http in development, https in production
  const protocol = isDevelopment ? 'http' : 'https';
  const baseUrl = `${protocol}://${virtualHost}:${virtualPort}`;

  return {
    nodeEnv,
    port,
    apiKeySecret: process.env.API_KEY_SECRET,
    isDevelopment,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    baseUrl,
    virtualHost,
    virtualPort: parseInt(virtualPort, 10),
  };
});
