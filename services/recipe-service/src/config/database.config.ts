import { registerAs } from '@nestjs/config';

console.log({ env: process.env.DB_SYNC });
const {
  DB_ENGINE: type = 'postgres',
  DB_HOST: host = 'localhost',
  PORT: port = 5432,
  DB_USERNAME: username = 'postgres',
  DB_PASSWORD: password = 'postgres',
  DB_NAME: database = 'recipes',
  DB_SYNC: synchronize = false,
} = process.env;

export default registerAs('database', () => ({
  host,
  port,
  username,
  password,
  database,
  type,
  synchronize: synchronize && synchronize !== 'false',
}));
