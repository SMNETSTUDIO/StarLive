import { Controller, Get } from "@nestjs/common";
import { SystemService } from "./system.service";

@Controller("system")
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get("features")
  getFeatures() {
    return this.system.getFeatures();
  }

  @Get("announcement")
  getAnnouncement() {
    return this.system.getAnnouncement();
  }
}
