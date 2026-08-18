import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { SeedService } from "./common/seed.service";
import { DanmakuModule } from "./danmaku/danmaku.module";
import { GiftModule } from "./gift/gift.module";
import { HealthModule } from "./health/health.module";
import { LotteryModule } from "./lottery/lottery.module";
import { ModerationModule } from "./moderation/moderation.module";
import { PaymentModule } from "./payment/payment.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RecordingModule } from "./recording/recording.module";
import { RedpacketModule } from "./redpacket/redpacket.module";
import { RoomsModule } from "./rooms/rooms.module";
import { StreamModule } from "./stream/stream.module";
import { SystemModule } from "./system/system.module";
import { WalletModule } from "./wallet/wallet.module";

@Module({
  imports: [
    HealthModule,
    AuthModule,
    StreamModule,
    PaymentModule,
    SystemModule,
    RoomsModule,
    DanmakuModule,
    GiftModule,
    WalletModule,
    RedpacketModule,
    LotteryModule,
    RecordingModule,
    ModerationModule,
    AdminModule,
    RealtimeModule,
  ],
  providers: [SeedService],
})
export class AppModule {}
