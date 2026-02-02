import { registerAs } from '@nestjs/config';

export default registerAs('ssl', () => ({
  letsencryptEmail: process.env.LETSENCRYPT_EMAIL,
  letsencryptStaging: process.env.LETSENCRYPT_STAGING === 'true',
}));
