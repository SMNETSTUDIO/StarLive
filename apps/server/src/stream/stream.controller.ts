import { Body, Controller, Post, Query } from "@nestjs/common";
import { mapStreamKeyToRoomId, setRoomStatus } from "../common/room-store";
import { StreamService } from "./stream.service";

@Controller("stream")
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  /**
   * MediaMTX / SRS 推流鉴权钩子。
   * MediaMTX 配置 authMethod: http 时，会在推流/拉流前请求本接口，
   * 携带 ?action=publish|read&path={streamKey} 等参数。
   * 返回 200 即允许，403 拒绝。
   */
  @Post("hook")
  async hook(
    @Query() query: Record<string, string>,
    @Body() body: Record<string, unknown>,
  ) {
    const params = { ...query, ...(body as Record<string, string>) };
    const action = params.action;
    const path = params.path ?? params.streamKey ?? "";

    // 仅处理推流事件，用于同步房间状态
    if (action === "publish" && path) {
      const roomId = await mapStreamKeyToRoomId(path);
      if (roomId) {
        await setRoomStatus(roomId, "active");
      }
    }

    void this.stream;
    return { allowed: true };
  }
}
