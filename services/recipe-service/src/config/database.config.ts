import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const {
  RECIPES_DB_HOST: host = 'localhost',
  RECIPES_DB_PORT = '5432',
  RECIPES_DB_USERNAME: username = 'postgres',
  RECIPES_DB_PASSWORD: password = 'postgres',
  RECIPES_DB_NAME: database = 'recipes',
  RECIPES_DB_SYNC: synchronize = 'false',
} = process.env;

const port = parseInt(RECIPES_DB_PORT);
const type = 'postgres';

export const databaseConfig: TypeOrmModuleOptions = {
  host,
  port,
  username,
  password,
  database,
  type,
  synchronize: synchronize && synchronize !== 'false',
  entities: [`${__dirname}/../**/*.entity.{ts,js}`],
};
