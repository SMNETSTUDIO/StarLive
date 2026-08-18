import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters";
import { TransformInterceptor } from "./common/interceptor";
import { config } from "./config/config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`StarLive server listening on http://localhost:${config.port}/api`);
}

void bootstrap();
