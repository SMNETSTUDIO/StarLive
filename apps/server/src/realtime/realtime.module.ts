import { Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
