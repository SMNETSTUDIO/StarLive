import { HttpException } from "@nestjs/common";
import type { ErrorCodeValue } from "@starlive/shared";

/**
 * 业务异常：由全局过滤器转换为统一 ApiResponse。
 * 默认 HTTP 200（前端按 code 判断），鉴权类可传 401/403。
 */
export class BizException extends HttpException {
  readonly code: ErrorCodeValue;

  constructor(code: ErrorCodeValue, message: string, httpStatus = 200) {
    super(message, httpStatus);
    this.code = code;
  }
}
