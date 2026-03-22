import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse } from "../../core/xml";
import type { CloudFormationService, Stack, ChangeSet, StackEvent, StackResource, StackSet, StackInstance } from "./cloudformation-service";

const NS = "http://cloudformation.amazonaws.com/doc/2010-05-15/";

export class CloudFormationQueryHandler {
  constructor(private service: CloudFormationService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateStack": return this.createStack(params, ctx);
        case "DescribeStacks": return this.describeStacks(params, ctx);
        case "UpdateStack": return this.updateStack(params, ctx);
        case "DeleteStack": return this.deleteStack(params, ctx);
        case "ListStacks": return this.listStacks(params, ctx);
        case "GetTemplate": return this.getTemplate(params, ctx);
        case "DescribeStackResources": return this.describeStackResources(params, ctx);
        case "DescribeStackEvents": return this.describeStackEvents(params, ctx);
        case "CreateChangeSet": return this.createChangeSet(params, ctx);
        case "DescribeChangeSet": return this.describeChangeSet(params, ctx);
        case "ExecuteChangeSet": return this.executeChangeSet(params, ctx);
        case "ValidateTemplate": return this.validateTemplate(params, ctx);
        case "GetTemplateSummary": return this.getTemplateSummary(params, ctx);
        case "ListStackResources": return this.listStackResources(params, ctx);
        case "CreateStackSet": return this.createStackSet(params, ctx);
        case "DescribeStackSet": return this.describeStackSet(params, ctx);
        case "ListStackSets": return this.listStackSets(params, ctx);
        case "DeleteStackSet": return this.deleteStackSet(params, ctx);
        case "CreateStackInstances": return this.createStackInstances(params, ctx);
        case "ListStackInstances": return this.listStackInstances(params, ctx);
        case "DeleteStackInstances": return this.deleteStackInstances(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createStack(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const templateBody = params.get("TemplateBody") ?? "{}";
    const parameters = this.extractParameters(params);
    const tags = this.extractTags(params);

    const stack = this.service.createStack(stackName, templateBody, parameters, tags, ctx.region);
    const xml = new XmlBuilder().elem("StackId", stack.stackId);
    return xmlResponse(xmlEnvelope("CreateStack", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeStacks(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName") ?? undefined;
    const stacks = this.service.describeStacks(stackName, ctx.region);
    const xml = new XmlBuilder().start("Stacks");
    for (const stack of stacks) xml.raw(this.stackXml(stack));
    xml.end("Stacks");
    return xmlResponse(xmlEnvelope("DescribeStacks", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private updateStack(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const templateBody = params.get("TemplateBody") ?? undefined;
    const parameters = this.extractParameters(params);

    const stack = this.service.updateStack(stackName, templateBody, parameters.length > 0 ? parameters : undefined, ctx.region);
    const xml = new XmlBuilder().elem("StackId", stack.stackId);
    return xmlResponse(xmlEnvelope("UpdateStack", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteStack(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    this.service.deleteStack(stackName, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteStack", ctx.requestId, NS), ctx.requestId);
  }

  private listStacks(params: URLSearchParams, ctx: RequestContext): Response {
    const stacks = this.service.listStacks(ctx.region);
    const xml = new XmlBuilder().start("StackSummaries");
    for (const stack of stacks) {
      xml.start("member")
        .elem("StackId", stack.stackId)
        .elem("StackName", stack.stackName)
        .elem("StackStatus", stack.status)
        .elem("CreationTime", new Date(stack.creationTime * 1000).toISOString())
        .elem("LastUpdatedTime", new Date(stack.lastUpdatedTime * 1000).toISOString())
        .elem("StackStatusReason", stack.statusReason)
        .end("member");
    }
    xml.end("StackSummaries");
    return xmlResponse(xmlEnvelope("ListStacks", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private getTemplate(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const templateBody = this.service.getTemplate(stackName, ctx.region);
    const xml = new XmlBuilder().elem("TemplateBody", templateBody);
    return xmlResponse(xmlEnvelope("GetTemplate", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeStackResources(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const resources = this.service.describeStackResources(stackName, ctx.region);
    const xml = new XmlBuilder().start("StackResources");
    for (const r of resources) {
      xml.raw(this.resourceXml(r));
    }
    xml.end("StackResources");
    return xmlResponse(xmlEnvelope("DescribeStackResources", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeStackEvents(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const events = this.service.describeStackEvents(stackName, ctx.region);
    const xml = new XmlBuilder().start("StackEvents");
    for (const e of events) {
      xml.raw(this.eventXml(e));
    }
    xml.end("StackEvents");
    return xmlResponse(xmlEnvelope("DescribeStackEvents", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private createChangeSet(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const changeSetName = params.get("ChangeSetName")!;
    const templateBody = params.get("TemplateBody") ?? "{}";
    const parameters = this.extractParameters(params);

    const cs = this.service.createChangeSet(stackName, changeSetName, templateBody, parameters, ctx.region);
    const xml = new XmlBuilder()
      .elem("Id", cs.changeSetId)
      .elem("StackId", cs.stackId);
    return xmlResponse(xmlEnvelope("CreateChangeSet", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeChangeSet(params: URLSearchParams, ctx: RequestContext): Response {
    const changeSetName = params.get("ChangeSetName")!;
    const stackName = params.get("StackName") ?? undefined;

    const cs = this.service.describeChangeSet(changeSetName, stackName, ctx.region);
    const xml = new XmlBuilder()
      .elem("ChangeSetId", cs.changeSetId)
      .elem("ChangeSetName", cs.changeSetName)
      .elem("StackId", cs.stackId)
      .elem("StackName", cs.stackName)
      .elem("Status", cs.status)
      .elem("StatusReason", cs.statusReason)
      .elem("CreationTime", new Date(cs.creationTime * 1000).toISOString());

    xml.start("Parameters");
    for (const p of cs.parameters) {
      xml.start("member")
        .elem("ParameterKey", p.ParameterKey)
        .elem("ParameterValue", p.ParameterValue)
        .end("member");
    }
    xml.end("Parameters");

    return xmlResponse(xmlEnvelope("DescribeChangeSet", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private executeChangeSet(params: URLSearchParams, ctx: RequestContext): Response {
    const changeSetName = params.get("ChangeSetName")!;
    const stackName = params.get("StackName") ?? undefined;
    this.service.executeChangeSet(changeSetName, stackName, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("ExecuteChangeSet", ctx.requestId, NS), ctx.requestId);
  }

  private validateTemplate(params: URLSearchParams, ctx: RequestContext): Response {
    const templateBody = params.get("TemplateBody")!;
    const templateParams = this.service.validateTemplate(templateBody);
    const xml = new XmlBuilder().start("Parameters");
    for (const p of templateParams) {
      xml.start("member")
        .elem("ParameterKey", p.ParameterKey);
      if (p.DefaultValue !== undefined) xml.elem("DefaultValue", p.DefaultValue);
      if (p.Description !== undefined) xml.elem("Description", p.Description);
      xml.end("member");
    }
    xml.end("Parameters");
    return xmlResponse(xmlEnvelope("ValidateTemplate", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private getTemplateSummary(params: URLSearchParams, ctx: RequestContext): Response {
    const templateBody = params.get("TemplateBody")!;
    const summary = this.service.getTemplateSummary(templateBody);
    const xml = new XmlBuilder();

    xml.start("Parameters");
    for (const p of summary.parameters) {
      xml.start("member")
        .elem("ParameterKey", p.ParameterKey)
        .elem("ParameterType", p.ParameterType);
      if (p.DefaultValue !== undefined) xml.elem("DefaultValue", p.DefaultValue);
      if (p.Description !== undefined) xml.elem("Description", p.Description);
      xml.end("member");
    }
    xml.end("Parameters");

    xml.start("ResourceTypes");
    for (const rt of summary.resourceTypes) {
      xml.elem("member", rt);
    }
    xml.end("ResourceTypes");

    if (summary.description) xml.elem("Description", summary.description);

    xml.start("Capabilities");
    for (const cap of summary.capabilities) {
      xml.elem("member", cap);
    }
    xml.end("Capabilities");

    return xmlResponse(xmlEnvelope("GetTemplateSummary", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private listStackResources(params: URLSearchParams, ctx: RequestContext): Response {
    const stackName = params.get("StackName")!;
    const resources = this.service.listStackResources(stackName, ctx.region);
    const xml = new XmlBuilder().start("StackResourceSummaries");
    for (const r of resources) {
      xml.start("member")
        .elem("LogicalResourceId", r.logicalResourceId)
        .elem("PhysicalResourceId", r.physicalResourceId)
        .elem("ResourceType", r.resourceType)
        .elem("ResourceStatus", r.resourceStatus)
        .elem("LastUpdatedTimestamp", new Date(r.timestamp * 1000).toISOString())
        .end("member");
    }
    xml.end("StackResourceSummaries");
    return xmlResponse(xmlEnvelope("ListStackResources", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private createStackSet(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSetName = params.get("StackSetName")!;
    const templateBody = params.get("TemplateBody") ?? "{}";
    const parameters = this.extractParameters(params);
    const capabilities = this.extractCapabilities(params);
    const administrationRoleARN = params.get("AdministrationRoleARN") ?? undefined;

    const ss = this.service.createStackSet(stackSetName, templateBody, parameters, capabilities, administrationRoleARN, ctx.region);
    const xml = new XmlBuilder().elem("StackSetId", ss.stackSetId);
    return xmlResponse(xmlEnvelope("CreateStackSet", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeStackSet(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSetName = params.get("StackSetName")!;
    const ss = this.service.describeStackSet(stackSetName, ctx.region);
    const xml = new XmlBuilder().start("StackSet")
      .elem("StackSetName", ss.stackSetName)
      .elem("StackSetId", ss.stackSetId)
      .elem("StackSetARN", ss.stackSetArn)
      .elem("Status", ss.status)
      .elem("TemplateBody", ss.templateBody);
    if (ss.administrationRoleARN) xml.elem("AdministrationRoleARN", ss.administrationRoleARN);
    xml.start("Parameters");
    for (const p of ss.parameters) {
      xml.start("member")
        .elem("ParameterKey", p.ParameterKey)
        .elem("ParameterValue", p.ParameterValue)
        .end("member");
    }
    xml.end("Parameters");
    xml.start("Capabilities");
    for (const c of ss.capabilities) {
      xml.elem("member", c);
    }
    xml.end("Capabilities");
    xml.end("StackSet");
    return xmlResponse(xmlEnvelope("DescribeStackSet", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private listStackSets(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSets = this.service.listStackSets(ctx.region);
    const xml = new XmlBuilder().start("Summaries");
    for (const ss of stackSets) {
      xml.start("member")
        .elem("StackSetName", ss.stackSetName)
        .elem("StackSetId", ss.stackSetId)
        .elem("Status", ss.status)
        .end("member");
    }
    xml.end("Summaries");
    return xmlResponse(xmlEnvelope("ListStackSets", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteStackSet(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSetName = params.get("StackSetName")!;
    this.service.deleteStackSet(stackSetName, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteStackSet", ctx.requestId, NS), ctx.requestId);
  }

  private createStackInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSetName = params.get("StackSetName")!;
    const accounts = this.extractListMembers(params, "Accounts");
    const regions = this.extractListMembers(params, "Regions");

    const operationId = this.service.createStackInstances(stackSetName, accounts, regions, ctx.region);
    const xml = new XmlBuilder().elem("OperationId", operationId);
    return xmlResponse(xmlEnvelope("CreateStackInstances", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private listStackInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSetName = params.get("StackSetName")!;
    const instances = this.service.listStackInstances(stackSetName, ctx.region);
    const xml = new XmlBuilder().start("Summaries");
    for (const si of instances) {
      xml.start("member")
        .elem("StackSetId", si.stackSetId)
        .elem("Account", si.account)
        .elem("Region", si.region)
        .elem("Status", si.status)
        .end("member");
    }
    xml.end("Summaries");
    return xmlResponse(xmlEnvelope("ListStackInstances", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteStackInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const stackSetName = params.get("StackSetName")!;
    const accounts = this.extractListMembers(params, "Accounts");
    const regions = this.extractListMembers(params, "Regions");

    const operationId = this.service.deleteStackInstances(stackSetName, accounts, regions, ctx.region);
    const xml = new XmlBuilder().elem("OperationId", operationId);
    return xmlResponse(xmlEnvelope("DeleteStackInstances", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- XML helpers ---

  private stackXml(stack: Stack): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("StackId", stack.stackId)
      .elem("StackName", stack.stackName)
      .elem("StackStatus", stack.status)
      .elem("StackStatusReason", stack.statusReason)
      .elem("CreationTime", new Date(stack.creationTime * 1000).toISOString())
      .elem("LastUpdatedTime", new Date(stack.lastUpdatedTime * 1000).toISOString());

    xml.start("Parameters");
    for (const p of stack.parameters) {
      xml.start("member")
        .elem("ParameterKey", p.ParameterKey)
        .elem("ParameterValue", p.ParameterValue)
        .end("member");
    }
    xml.end("Parameters");

    xml.start("Tags");
    for (const t of stack.tags) {
      xml.start("member")
        .elem("Key", t.Key)
        .elem("Value", t.Value)
        .end("member");
    }
    xml.end("Tags");

    xml.start("Outputs");
    for (const o of stack.outputs) {
      xml.start("member")
        .elem("OutputKey", o.OutputKey)
        .elem("OutputValue", o.OutputValue);
      if (o.Description) xml.elem("Description", o.Description);
      xml.end("member");
    }
    xml.end("Outputs");

    xml.elem("EnableTerminationProtection", false);
    xml.end("member");
    return xml.build();
  }

  private resourceXml(r: StackResource): string {
    return new XmlBuilder()
      .start("member")
      .elem("LogicalResourceId", r.logicalResourceId)
      .elem("PhysicalResourceId", r.physicalResourceId)
      .elem("ResourceType", r.resourceType)
      .elem("ResourceStatus", r.resourceStatus)
      .elem("Timestamp", new Date(r.timestamp * 1000).toISOString())
      .end("member")
      .build();
  }

  private eventXml(e: StackEvent): string {
    return new XmlBuilder()
      .start("member")
      .elem("EventId", e.eventId)
      .elem("StackId", e.stackId)
      .elem("StackName", e.stackName)
      .elem("LogicalResourceId", e.logicalResourceId)
      .elem("PhysicalResourceId", e.physicalResourceId)
      .elem("ResourceType", e.resourceType)
      .elem("ResourceStatus", e.resourceStatus)
      .elem("ResourceStatusReason", e.resourceStatusReason)
      .elem("Timestamp", new Date(e.timestamp * 1000).toISOString())
      .end("member")
      .build();
  }

  // --- Param extraction helpers ---

  private extractParameters(params: URLSearchParams): { ParameterKey: string; ParameterValue: string }[] {
    const result: { ParameterKey: string; ParameterValue: string }[] = [];
    let i = 1;
    while (params.has(`Parameters.member.${i}.ParameterKey`)) {
      result.push({
        ParameterKey: params.get(`Parameters.member.${i}.ParameterKey`)!,
        ParameterValue: params.get(`Parameters.member.${i}.ParameterValue`) ?? "",
      });
      i++;
    }
    return result;
  }

  private extractCapabilities(params: URLSearchParams): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`Capabilities.member.${i}`)) {
      result.push(params.get(`Capabilities.member.${i}`)!);
      i++;
    }
    return result;
  }

  private extractListMembers(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.member.${i}`)) {
      result.push(params.get(`${prefix}.member.${i}`)!);
      i++;
    }
    return result;
  }

  private extractTags(params: URLSearchParams): { Key: string; Value: string }[] {
    const result: { Key: string; Value: string }[] = [];
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      result.push({
        Key: params.get(`Tags.member.${i}.Key`)!,
        Value: params.get(`Tags.member.${i}.Value`) ?? "",
      });
      i++;
    }
    return result;
  }
}
