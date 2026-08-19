import { Module } from "@nestjs/common";
import { StreamModule } from "../stream/stream.module";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { ThumbnailService } from "./thumbnail.service";
import { UserController } from "./user.controller";

@Module({
  imports: [StreamModule],
  controllers: [RoomsController, UserController],
  providers: [RoomsService, ThumbnailService],
  exports: [RoomsService],
})
export class RoomsModule {}
