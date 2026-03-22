import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Flow {
  flowArn: string;
  name: string;
  status: string;
  description: string;
  source: any;
  outputs: any[];
  entitlements: any[];
  availabilityZone: string;
}

export class MediaConnectService {
  private flows: StorageBackend<string, Flow>;
  private counter = 0;

  constructor(private accountId: string) {
    this.flows = new InMemoryStorage();
  }

  createFlow(name: string, region: string, source?: any): Flow {
    const id = `flow-${++this.counter}-${crypto.randomUUID().slice(0, 8)}`;
    const flow: Flow = {
      flowArn: buildArn("mediaconnect", region, this.accountId, "flow:", id),
      name,
      status: "STANDBY",
      description: "",
      source: source ?? { name: "default-source" },
      outputs: [],
      entitlements: [],
      availabilityZone: `${region}a`,
    };
    this.flows.set(flow.flowArn, flow);
    return flow;
  }

  describeFlow(flowArn: string): Flow {
    const flow = this.flows.get(flowArn);
    if (!flow) throw new AwsError("NotFoundException", `Flow ${flowArn} not found.`, 404);
    return flow;
  }

  listFlows(): Flow[] {
    return this.flows.values();
  }

  deleteFlow(flowArn: string): void {
    const flow = this.flows.get(flowArn);
    if (!flow) throw new AwsError("NotFoundException", `Flow ${flowArn} not found.`, 404);
    if (flow.status === "ACTIVE") throw new AwsError("BadRequestException", "Cannot delete an active flow.", 400);
    this.flows.delete(flowArn);
  }

  startFlow(flowArn: string): Flow {
    const flow = this.flows.get(flowArn);
    if (!flow) throw new AwsError("NotFoundException", `Flow ${flowArn} not found.`, 404);
    flow.status = "ACTIVE";
    this.flows.set(flowArn, flow);
    return flow;
  }

  stopFlow(flowArn: string): Flow {
    const flow = this.flows.get(flowArn);
    if (!flow) throw new AwsError("NotFoundException", `Flow ${flowArn} not found.`, 404);
    flow.status = "STANDBY";
    this.flows.set(flowArn, flow);
    return flow;
  }

  addFlowOutputs(flowArn: string, outputs: any[]): any[] {
    const flow = this.flows.get(flowArn);
    if (!flow) throw new AwsError("NotFoundException", `Flow ${flowArn} not found.`, 404);
    const added = outputs.map((o, i) => ({
      ...o,
      outputArn: `${flowArn}:output:out-${flow.outputs.length + i + 1}`,
      name: o.name ?? o.Name ?? `output-${flow.outputs.length + i + 1}`,
    }));
    flow.outputs.push(...added);
    this.flows.set(flowArn, flow);
    return added;
  }

  removeFlowOutput(flowArn: string, outputArn: string): void {
    const flow = this.flows.get(flowArn);
    if (!flow) throw new AwsError("NotFoundException", `Flow ${flowArn} not found.`, 404);
    flow.outputs = flow.outputs.filter((o: any) => o.outputArn !== outputArn);
    this.flows.set(flowArn, flow);
  }
}
