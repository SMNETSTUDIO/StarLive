import { Module } from "@nestjs/common";
import { GiftController } from "./gift.controller";
import { GiftService } from "./gift.service";

@Module({
  controllers: [GiftController],
  providers: [GiftService],
  exports: [GiftService],
})
export class GiftModule {}
