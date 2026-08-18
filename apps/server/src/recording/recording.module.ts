import { Module } from "@nestjs/common";
import { StreamModule } from "../stream/stream.module";
import { RecordingController } from "./recording.controller";
import { RecordingService } from "./recording.service";

@Module({
  imports: [StreamModule],
  controllers: [RecordingController],
  providers: [RecordingService],
  exports: [RecordingService],
})
export class RecordingModule {}
