import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { BudgetsService } from "./budgets-service";

export class BudgetsHandler {
  constructor(private service: BudgetsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateBudget":
          this.service.createBudget(body.AccountId ?? ctx.accountId, body.Budget, body.NotificationsWithSubscribers ?? []);
          return this.json({}, ctx);

        case "DescribeBudget": {
          const budget = this.service.describeBudget(body.AccountId ?? ctx.accountId, body.BudgetName);
          return this.json({ Budget: budget }, ctx);
        }

        case "DescribeBudgets": {
          const budgets = this.service.describeBudgets(body.AccountId ?? ctx.accountId);
          return this.json({ Budgets: budgets }, ctx);
        }

        case "UpdateBudget":
          this.service.updateBudget(body.AccountId ?? ctx.accountId, body.NewBudget);
          return this.json({}, ctx);

        case "DeleteBudget":
          this.service.deleteBudget(body.AccountId ?? ctx.accountId, body.BudgetName);
          return this.json({}, ctx);

        case "CreateNotification":
          this.service.createNotification(
            body.AccountId ?? ctx.accountId,
            body.BudgetName,
            body.Notification,
            body.Subscribers ?? [],
          );
          return this.json({}, ctx);

        case "DescribeNotificationsForBudget": {
          const notifications = this.service.describeNotificationsForBudget(body.AccountId ?? ctx.accountId, body.BudgetName);
          return this.json({ Notifications: notifications }, ctx);
        }

        case "DeleteNotification":
          this.service.deleteNotification(body.AccountId ?? ctx.accountId, body.BudgetName, body.Notification);
          return this.json({}, ctx);

        case "CreateSubscriber":
          this.service.createSubscriber(
            body.AccountId ?? ctx.accountId,
            body.BudgetName,
            body.Notification,
            body.Subscriber,
          );
          return this.json({}, ctx);

        case "DescribeSubscribersForNotification": {
          const subscribers = this.service.describeSubscribersForNotification(
            body.AccountId ?? ctx.accountId,
            body.BudgetName,
            body.Notification,
          );
          return this.json({ Subscribers: subscribers }, ctx);
        }

        case "DeleteSubscriber":
          this.service.deleteSubscriber(
            body.AccountId ?? ctx.accountId,
            body.BudgetName,
            body.Notification,
            body.Subscriber,
          );
          return this.json({}, ctx);

        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
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
