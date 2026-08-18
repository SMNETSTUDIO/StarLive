import { Module } from "@nestjs/common";
import { DanmakuController } from "./danmaku.controller";
import { DanmakuService } from "./danmaku.service";

@Module({
  controllers: [DanmakuController],
  providers: [DanmakuService],
  exports: [DanmakuService],
})
export class DanmakuModule {}
