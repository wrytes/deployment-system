import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_KEY_SECRET: Joi.string().min(32).required(),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // Docker
  DOCKER_SOCKET_PATH: Joi.string().default('/var/run/docker.sock'),
  DOCKER_SWARM_ADVERTISE_ADDR: Joi.string().optional(),
  NGINX_CONTAINER_NAME: Joi.string().default('nginx_proxy'),

  // Telegram
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  TELEGRAM_WEBHOOK_DOMAIN: Joi.string().allow('').optional(),
  TELEGRAM_WEBHOOK_PATH: Joi.string().default('/telegram/webhook'),

  // Let's Encrypt
  LETSENCRYPT_EMAIL: Joi.string().email().required(),
  LETSENCRYPT_STAGING: Joi.boolean().default(true),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
  LOG_PRETTY: Joi.boolean().default(false),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});
