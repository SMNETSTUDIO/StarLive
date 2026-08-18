import { Module } from "@nestjs/common";
import { StreamController } from "./stream.controller";
import { StreamService } from "./stream.service";

@Module({
  controllers: [StreamController],
  providers: [StreamService],
  exports: [StreamService],
})
export class StreamModule {}
