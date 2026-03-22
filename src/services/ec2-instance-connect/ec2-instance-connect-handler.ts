import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EC2InstanceConnectService } from "./ec2-instance-connect-service";

export class EC2InstanceConnectHandler {
  constructor(private service: EC2InstanceConnectService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "SendSSHPublicKey": {
          const success = this.service.sendSSHPublicKey(body.InstanceId, body.InstanceOSUser, body.SSHPublicKey, body.AvailabilityZone);
          return this.json({ RequestId: ctx.requestId, Success: success }, ctx);
        }
        case "SendSerialConsoleSSHPublicKey": {
          const success = this.service.sendSerialConsoleSSHPublicKey(body.InstanceId, body.SerialPort ?? 0, body.SSHPublicKey);
          return this.json({ RequestId: ctx.requestId, Success: success }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("InvalidAction", `Unknown action ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
