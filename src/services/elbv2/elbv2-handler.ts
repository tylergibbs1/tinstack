import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { Elbv2Service, LoadBalancer, TargetGroup, Listener } from "./elbv2-service";

const NS = "http://elasticloadbalancing.amazonaws.com/doc/2015-12-01/";

export class Elbv2QueryHandler {
  constructor(private service: Elbv2Service) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        // Load Balancers
        case "CreateLoadBalancer": return this.createLoadBalancer(params, ctx);
        case "DescribeLoadBalancers": return this.describeLoadBalancers(params, ctx);
        case "DeleteLoadBalancer": return this.deleteLoadBalancer(params, ctx);
        case "DescribeLoadBalancerAttributes": return this.describeLoadBalancerAttributes(params, ctx);
        case "ModifyLoadBalancerAttributes": return this.modifyLoadBalancerAttributes(params, ctx);

        // Target Groups
        case "CreateTargetGroup": return this.createTargetGroup(params, ctx);
        case "DescribeTargetGroups": return this.describeTargetGroups(params, ctx);
        case "DeleteTargetGroup": return this.deleteTargetGroup(params, ctx);
        case "DescribeTargetGroupAttributes": return this.describeTargetGroupAttributes(params, ctx);
        case "ModifyTargetGroupAttributes": return this.modifyTargetGroupAttributes(params, ctx);

        // Listeners
        case "CreateListener": return this.createListener(params, ctx);
        case "DescribeListeners": return this.describeListeners(params, ctx);
        case "DeleteListener": return this.deleteListener(params, ctx);

        // Tags
        case "DescribeTags": return this.describeTags(params, ctx);
        case "AddTags": return this.addTags(params, ctx);
        case "RemoveTags": return this.removeTags(params, ctx);

        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  // --- Load Balancers ---

  private createLoadBalancer(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("Name")!;
    const subnets = this.extractMembers(params, "Subnets.member");
    const securityGroups = this.extractMembers(params, "SecurityGroups.member");
    const scheme = params.get("Scheme") ?? undefined;
    const type = params.get("Type") ?? undefined;
    const tags = this.extractTags(params);

    const lb = this.service.createLoadBalancer(name, subnets, securityGroups, scheme, type, tags, ctx.region);
    const xml = new XmlBuilder().start("LoadBalancers").raw(this.lbXml(lb)).end("LoadBalancers");
    return xmlResponse(xmlEnvelope("CreateLoadBalancer", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeLoadBalancers(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "LoadBalancerArns.member");
    const names = this.extractMembers(params, "Names.member");
    const lbs = this.service.describeLoadBalancers(
      arns.length > 0 ? arns : undefined,
      names.length > 0 ? names : undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("LoadBalancers");
    for (const lb of lbs) xml.raw(this.lbXml(lb));
    xml.end("LoadBalancers");
    return xmlResponse(xmlEnvelope("DescribeLoadBalancers", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteLoadBalancer(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteLoadBalancer(params.get("LoadBalancerArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteLoadBalancer", ctx.requestId, NS), ctx.requestId);
  }

  private describeLoadBalancerAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = this.service.describeLoadBalancerAttributes(params.get("LoadBalancerArn")!);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of attrs) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("DescribeLoadBalancerAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private modifyLoadBalancerAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("LoadBalancerArn")!;
    const attrs = this.extractAttributes(params);
    const result = this.service.modifyLoadBalancerAttributes(arn, attrs);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of result) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("ModifyLoadBalancerAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Target Groups ---

  private createTargetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.extractTags(params);
    const tg = this.service.createTargetGroup(
      params.get("Name")!,
      params.get("Protocol") ?? undefined,
      params.get("Port") ? parseInt(params.get("Port")!) : undefined,
      params.get("VpcId") ?? undefined,
      params.get("TargetType") ?? undefined,
      params.get("HealthCheckProtocol") ?? undefined,
      params.get("HealthCheckPath") ?? undefined,
      tags,
      ctx.region,
    );
    const xml = new XmlBuilder().start("TargetGroups").raw(this.tgXml(tg)).end("TargetGroups");
    return xmlResponse(xmlEnvelope("CreateTargetGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeTargetGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "TargetGroupArns.member");
    const tgs = this.service.describeTargetGroups(arns.length > 0 ? arns : undefined, ctx.region);
    const xml = new XmlBuilder().start("TargetGroups");
    for (const tg of tgs) xml.raw(this.tgXml(tg));
    xml.end("TargetGroups");
    return xmlResponse(xmlEnvelope("DescribeTargetGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteTargetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteTargetGroup(params.get("TargetGroupArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteTargetGroup", ctx.requestId, NS), ctx.requestId);
  }

  private describeTargetGroupAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = this.service.describeTargetGroupAttributes(params.get("TargetGroupArn")!);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of attrs) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("DescribeTargetGroupAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private modifyTargetGroupAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("TargetGroupArn")!;
    const attrs = this.extractAttributes(params);
    const result = this.service.modifyTargetGroupAttributes(arn, attrs);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of result) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("ModifyTargetGroupAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Listeners ---

  private createListener(params: URLSearchParams, ctx: RequestContext): Response {
    const lbArn = params.get("LoadBalancerArn")!;
    const protocol = params.get("Protocol") ?? undefined;
    const port = parseInt(params.get("Port") ?? "80");
    const actions = this.extractDefaultActions(params);
    const tags = this.extractTags(params);

    const listener = this.service.createListener(lbArn, protocol, port, actions, tags, ctx.region);
    const xml = new XmlBuilder().start("Listeners").raw(this.listenerXml(listener)).end("Listeners");
    return xmlResponse(xmlEnvelope("CreateListener", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeListeners(params: URLSearchParams, ctx: RequestContext): Response {
    const lbArn = params.get("LoadBalancerArn") ?? undefined;
    const arns = this.extractMembers(params, "ListenerArns.member");
    const listeners = this.service.describeListeners(lbArn, arns.length > 0 ? arns : undefined, ctx.region);
    const xml = new XmlBuilder().start("Listeners");
    for (const l of listeners) xml.raw(this.listenerXml(l));
    xml.end("Listeners");
    return xmlResponse(xmlEnvelope("DescribeListeners", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteListener(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteListener(params.get("ListenerArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteListener", ctx.requestId, NS), ctx.requestId);
  }

  // --- Tags ---

  private describeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "ResourceArns.member");
    const descriptions = this.service.describeTags(arns);
    const xml = new XmlBuilder().start("TagDescriptions");
    for (const desc of descriptions) {
      xml.start("member");
      xml.elem("ResourceArn", desc.resourceArn);
      xml.start("Tags");
      for (const t of desc.tags) {
        xml.start("member").elem("Key", t.key).elem("Value", t.value).end("member");
      }
      xml.end("Tags");
      xml.end("member");
    }
    xml.end("TagDescriptions");
    return xmlResponse(xmlEnvelope("DescribeTags", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private addTags(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "ResourceArns.member");
    const tags: { key: string; value: string }[] = [];
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags.push({ key: params.get(`Tags.member.${i}.Key`)!, value: params.get(`Tags.member.${i}.Value`)! });
      i++;
    }
    this.service.addTags(arns, tags);
    return xmlResponse(xmlEnvelopeNoResult("AddTags", ctx.requestId, NS), ctx.requestId);
  }

  private removeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "ResourceArns.member");
    const tagKeys = this.extractMembers(params, "TagKeys.member");
    this.service.removeTags(arns, tagKeys);
    return xmlResponse(xmlEnvelopeNoResult("RemoveTags", ctx.requestId, NS), ctx.requestId);
  }

  // --- XML helpers ---

  private lbXml(lb: LoadBalancer): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("LoadBalancerArn", lb.loadBalancerArn)
      .elem("LoadBalancerName", lb.loadBalancerName)
      .elem("DNSName", lb.dnsName)
      .elem("Scheme", lb.scheme)
      .elem("Type", lb.type)
      .elem("VpcId", lb.vpcId)
      .elem("CreatedTime", lb.createdTime)
      .start("State").elem("Code", lb.state.code).end("State")
      .start("AvailabilityZones");
    for (const az of lb.availabilityZones) {
      xml.start("member").elem("ZoneName", az.zoneName).elem("SubnetId", az.subnetId).end("member");
    }
    xml.end("AvailabilityZones")
      .start("SecurityGroups");
    for (const sg of lb.securityGroups) {
      xml.elem("member", sg);
    }
    xml.end("SecurityGroups")
      .end("member");
    return xml.build();
  }

  private tgXml(tg: TargetGroup): string {
    return new XmlBuilder()
      .start("member")
      .elem("TargetGroupArn", tg.targetGroupArn)
      .elem("TargetGroupName", tg.targetGroupName)
      .elem("Protocol", tg.protocol)
      .elem("Port", tg.port)
      .elem("VpcId", tg.vpcId)
      .elem("TargetType", tg.targetType)
      .elem("HealthCheckProtocol", tg.healthCheckProtocol)
      .elem("HealthCheckPath", tg.healthCheckPath)
      .elem("HealthCheckPort", tg.healthCheckPort)
      .elem("HealthCheckIntervalSeconds", tg.healthCheckIntervalSeconds)
      .elem("HealthCheckTimeoutSeconds", tg.healthCheckTimeoutSeconds)
      .elem("HealthyThresholdCount", tg.healthyThresholdCount)
      .elem("UnhealthyThresholdCount", tg.unhealthyThresholdCount)
      .end("member")
      .build();
  }

  private listenerXml(l: Listener): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("ListenerArn", l.listenerArn)
      .elem("LoadBalancerArn", l.loadBalancerArn)
      .elem("Protocol", l.protocol)
      .elem("Port", l.port)
      .start("DefaultActions");
    for (const a of l.defaultActions) {
      xml.start("member").elem("Type", a.type);
      if (a.targetGroupArn) xml.elem("TargetGroupArn", a.targetGroupArn);
      if (a.order !== undefined) xml.elem("Order", a.order);
      xml.end("member");
    }
    xml.end("DefaultActions").end("member");
    return xml.build();
  }

  // --- Param extraction helpers ---

  private extractMembers(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.${i}`)) {
      result.push(params.get(`${prefix}.${i}`)!);
      i++;
    }
    return result;
  }

  private extractTags(params: URLSearchParams): Record<string, string> {
    const tags: Record<string, string> = {};
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags[params.get(`Tags.member.${i}.Key`)!] = params.get(`Tags.member.${i}.Value`) ?? "";
      i++;
    }
    return tags;
  }

  private extractAttributes(params: URLSearchParams): { key: string; value: string }[] {
    const attrs: { key: string; value: string }[] = [];
    let i = 1;
    while (params.has(`Attributes.member.${i}.Key`)) {
      attrs.push({
        key: params.get(`Attributes.member.${i}.Key`)!,
        value: params.get(`Attributes.member.${i}.Value`) ?? "",
      });
      i++;
    }
    return attrs;
  }

  private extractDefaultActions(params: URLSearchParams): { type: string; targetGroupArn?: string; order?: number }[] {
    const actions: { type: string; targetGroupArn?: string; order?: number }[] = [];
    let i = 1;
    while (params.has(`DefaultActions.member.${i}.Type`)) {
      const action: any = { type: params.get(`DefaultActions.member.${i}.Type`)! };
      const tgArn = params.get(`DefaultActions.member.${i}.TargetGroupArn`);
      if (tgArn) action.targetGroupArn = tgArn;
      const order = params.get(`DefaultActions.member.${i}.Order`);
      if (order) action.order = parseInt(order);
      actions.push(action);
      i++;
    }
    return actions;
  }
}
