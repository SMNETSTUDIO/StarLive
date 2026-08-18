import { Controller, Get } from "@nestjs/common";
import { PaymentService } from "./payment.service";

@Controller("payment")
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  @Get("providers")
  listProviders() {
    return { providers: this.payment.listProviders() };
  }
}
