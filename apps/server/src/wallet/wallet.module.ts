import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { SystemModule } from "../system/system.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [PaymentModule, SystemModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
