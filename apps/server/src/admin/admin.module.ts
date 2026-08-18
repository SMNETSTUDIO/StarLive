import { Module } from "@nestjs/common";
import { ModerationModule } from "../moderation/moderation.module";
import { SystemModule } from "../system/system.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [WalletModule, ModerationModule, SystemModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
