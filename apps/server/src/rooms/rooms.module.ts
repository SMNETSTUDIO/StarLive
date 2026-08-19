import { Module } from "@nestjs/common";
import { StreamModule } from "../stream/stream.module";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { UserController } from "./user.controller";

@Module({
  imports: [StreamModule],
  controllers: [RoomsController, UserController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
