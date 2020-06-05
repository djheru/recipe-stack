import { registerAs } from '@nestjs/config';

const {
  DB_HOST: host = 'localhost',
  PORT: port = 5432,
  DB_USERNAME: username = 'postgres',
  DB_PASSWORD: password = 'postgres',
  DB_NAME: database = 'recipes',
} = process.env;

export default registerAs('database', () => ({
  host,
  port,
  username,
  password,
  database,
}));
