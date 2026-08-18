import { Module } from "@nestjs/common";
import { RedpacketController } from "./redpacket.controller";
import { RedpacketService } from "./redpacket.service";

@Module({
  controllers: [RedpacketController],
  providers: [RedpacketService],
  exports: [RedpacketService],
})
export class RedpacketModule {}
