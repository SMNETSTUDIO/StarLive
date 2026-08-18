import { Controller, Get } from "@nestjs/common";
import { PaymentService } from "./payment.service";

@Controller("payment")
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  @Get("providers")
  async listProviders() {
    return { providers: await this.payment.listProviders() };
  }
}
