import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";
import { ErrorCode } from "@starlive/shared";
import { BizException } from "./errors";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof BizException) {
      res
        .status(exception.getStatus())
        .json({ code: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : ((body as { message?: unknown }).message as string) ??
            exception.message;
      res.status(status).json({ code: status, message });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("[unhandled]", exception);
    res.status(500).json({ code: ErrorCode.INTERNAL, message: "internal_error" });
  }
}
