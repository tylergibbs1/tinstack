import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Notification {
  NotificationType: string;
  ComparisonOperator: string;
  Threshold: number;
  ThresholdType: string;
  NotificationState?: string;
}

export interface Subscriber {
  SubscriptionType: string;
  Address: string;
}

export interface Budget {
  BudgetName: string;
  BudgetType: string;
  BudgetLimit: { Amount: string; Unit: string };
  TimeUnit: string;
  TimePeriod: { Start: number; End: number };
  CalculatedSpend: {
    ActualSpend: { Amount: string; Unit: string };
    ForecastedSpend: { Amount: string; Unit: string };
  };
  CostTypes?: Record<string, boolean>;
  LastUpdatedTime: number;
  notifications: { notification: Notification; subscribers: Subscriber[] }[];
}

export class BudgetsService {
  private budgets: StorageBackend<string, Budget>;

  constructor(private accountId: string) {
    this.budgets = new InMemoryStorage();
  }

  private budgetKey(accountId: string, budgetName: string): string {
    return `${accountId}:${budgetName}`;
  }

  createBudget(accountId: string, budget: any, notificationsWithSubscribers: any[]): void {
    const key = this.budgetKey(accountId, budget.BudgetName);
    if (this.budgets.has(key)) {
      throw new AwsError("DuplicateRecordException", `Budget ${budget.BudgetName} already exists.`, 400);
    }

    const now = Date.now() / 1000;
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const stored: Budget = {
      BudgetName: budget.BudgetName,
      BudgetType: budget.BudgetType ?? "COST",
      BudgetLimit: budget.BudgetLimit ?? { Amount: "100", Unit: "USD" },
      TimeUnit: budget.TimeUnit ?? "MONTHLY",
      TimePeriod: budget.TimePeriod ?? {
        Start: firstDayOfMonth.getTime() / 1000,
        End: 3706473600,
      },
      CalculatedSpend: {
        ActualSpend: { Amount: "0", Unit: "USD" },
        ForecastedSpend: { Amount: "0", Unit: "USD" },
      },
      CostTypes: budget.BudgetType === "COST" ? {
        IncludeCredit: true,
        IncludeDiscount: true,
        IncludeOtherSubscription: true,
        IncludeRecurring: true,
        IncludeRefund: true,
        IncludeSubscription: true,
        IncludeSupport: true,
        IncludeTax: true,
        IncludeUpfront: true,
        UseAmortized: false,
        UseBlended: false,
        ...budget.CostTypes,
      } : undefined,
      LastUpdatedTime: now,
      notifications: (notificationsWithSubscribers ?? []).map((n: any) => ({
        notification: n.Notification,
        subscribers: n.Subscribers ?? [],
      })),
    };
    this.budgets.set(key, stored);
  }

  describeBudget(accountId: string, budgetName: string): Record<string, any> {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Unable to get budget: ${budgetName} - the budget doesn't exist.`, 404);
    }
    return this.formatBudget(budget);
  }

  describeBudgets(accountId: string): Record<string, any>[] {
    return this.budgets.values()
      .filter((b) => this.budgetKey(accountId, b.BudgetName).startsWith(`${accountId}:`))
      .map((b) => this.formatBudget(b));
  }

  updateBudget(accountId: string, newBudget: any): void {
    const key = this.budgetKey(accountId, newBudget.BudgetName);
    const existing = this.budgets.get(key);
    if (!existing) {
      throw new AwsError("NotFoundException", `Unable to update budget: ${newBudget.BudgetName} - the budget doesn't exist.`, 404);
    }
    existing.BudgetLimit = newBudget.BudgetLimit ?? existing.BudgetLimit;
    existing.BudgetType = newBudget.BudgetType ?? existing.BudgetType;
    existing.TimeUnit = newBudget.TimeUnit ?? existing.TimeUnit;
    existing.TimePeriod = newBudget.TimePeriod ?? existing.TimePeriod;
    existing.CostTypes = newBudget.CostTypes ?? existing.CostTypes;
    existing.LastUpdatedTime = Date.now() / 1000;
    this.budgets.set(key, existing);
  }

  deleteBudget(accountId: string, budgetName: string): void {
    const key = this.budgetKey(accountId, budgetName);
    if (!this.budgets.has(key)) {
      throw new AwsError("NotFoundException", `Unable to delete budget: ${budgetName} - the budget doesn't exist.`, 404);
    }
    this.budgets.delete(key);
  }

  createNotification(accountId: string, budgetName: string, notification: Notification, subscribers: Subscriber[]): void {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Budget ${budgetName} doesn't exist.`, 404);
    }
    budget.notifications.push({ notification, subscribers });
    this.budgets.set(key, budget);
  }

  describeNotificationsForBudget(accountId: string, budgetName: string): Notification[] {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Budget ${budgetName} doesn't exist.`, 404);
    }
    return budget.notifications.map((n) => n.notification);
  }

  deleteNotification(accountId: string, budgetName: string, notification: Notification): void {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Budget ${budgetName} doesn't exist.`, 404);
    }
    budget.notifications = budget.notifications.filter(
      (n) => n.notification.NotificationType !== notification.NotificationType ||
             n.notification.ComparisonOperator !== notification.ComparisonOperator ||
             n.notification.Threshold !== notification.Threshold,
    );
    this.budgets.set(key, budget);
  }

  createSubscriber(accountId: string, budgetName: string, notification: Notification, subscriber: Subscriber): void {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Budget ${budgetName} doesn't exist.`, 404);
    }
    const entry = budget.notifications.find(
      (n) => n.notification.NotificationType === notification.NotificationType &&
             n.notification.ComparisonOperator === notification.ComparisonOperator &&
             n.notification.Threshold === notification.Threshold,
    );
    if (!entry) {
      throw new AwsError("NotFoundException", "Notification not found.", 404);
    }
    entry.subscribers.push(subscriber);
    this.budgets.set(key, budget);
  }

  describeSubscribersForNotification(accountId: string, budgetName: string, notification: Notification): Subscriber[] {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Budget ${budgetName} doesn't exist.`, 404);
    }
    const entry = budget.notifications.find(
      (n) => n.notification.NotificationType === notification.NotificationType &&
             n.notification.ComparisonOperator === notification.ComparisonOperator &&
             n.notification.Threshold === notification.Threshold,
    );
    return entry?.subscribers ?? [];
  }

  deleteSubscriber(accountId: string, budgetName: string, notification: Notification, subscriber: Subscriber): void {
    const key = this.budgetKey(accountId, budgetName);
    const budget = this.budgets.get(key);
    if (!budget) {
      throw new AwsError("NotFoundException", `Budget ${budgetName} doesn't exist.`, 404);
    }
    const entry = budget.notifications.find(
      (n) => n.notification.NotificationType === notification.NotificationType &&
             n.notification.ComparisonOperator === notification.ComparisonOperator &&
             n.notification.Threshold === notification.Threshold,
    );
    if (entry) {
      entry.subscribers = entry.subscribers.filter(
        (s) => s.SubscriptionType !== subscriber.SubscriptionType || s.Address !== subscriber.Address,
      );
    }
    this.budgets.set(key, budget);
  }

  private formatBudget(budget: Budget): Record<string, any> {
    const result: Record<string, any> = {
      BudgetName: budget.BudgetName,
      BudgetType: budget.BudgetType,
      BudgetLimit: budget.BudgetLimit,
      TimeUnit: budget.TimeUnit,
      TimePeriod: budget.TimePeriod,
      CalculatedSpend: budget.CalculatedSpend,
      LastUpdatedTime: budget.LastUpdatedTime,
    };
    if (budget.CostTypes) result.CostTypes = budget.CostTypes;
    return result;
  }
}
