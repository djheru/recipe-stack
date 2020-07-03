import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';

dotenv.config();
const { ADDRESS = '0.0.0.0', NAME, PORT = 9000 } = process.env;
console.log('Starting Nest.js application');
async function bootstrap() {
  const logger = new Logger('AppBootstrap');
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT, ADDRESS);
  logger.log(`${NAME} application running on: ${ADDRESS}:${PORT}`);
}
bootstrap();
