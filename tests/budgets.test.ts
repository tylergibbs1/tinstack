import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  BudgetsClient,
  CreateBudgetCommand,
  DescribeBudgetCommand,
  DescribeBudgetsCommand,
  UpdateBudgetCommand,
  DeleteBudgetCommand,
  CreateNotificationCommand,
  DescribeNotificationsForBudgetCommand,
  DeleteNotificationCommand,
  CreateSubscriberCommand,
  DescribeSubscribersForNotificationCommand,
  DeleteSubscriberCommand,
} from "@aws-sdk/client-budgets";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new BudgetsClient(clientConfig);
const ACCOUNT_ID = "000000000000";

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Budgets", () => {
  const budgetName = "test-budget";

  test("CreateBudget", async () => {
    await client.send(new CreateBudgetCommand({
      AccountId: ACCOUNT_ID,
      Budget: {
        BudgetName: budgetName,
        BudgetType: "COST",
        BudgetLimit: { Amount: "100", Unit: "USD" },
        TimeUnit: "MONTHLY",
      },
    }));
    // No error means success
  });

  test("DescribeBudget", async () => {
    const res = await client.send(new DescribeBudgetCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
    }));
    expect(res.Budget).toBeDefined();
    expect(res.Budget!.BudgetName).toBe(budgetName);
    expect(res.Budget!.BudgetType).toBe("COST");
    expect(res.Budget!.BudgetLimit!.Amount).toBe("100");
    expect(res.Budget!.CalculatedSpend).toBeDefined();
  });

  test("DescribeBudgets", async () => {
    const res = await client.send(new DescribeBudgetsCommand({
      AccountId: ACCOUNT_ID,
    }));
    expect(res.Budgets).toBeDefined();
    expect(res.Budgets!.length).toBeGreaterThanOrEqual(1);
    const found = res.Budgets!.find((b) => b.BudgetName === budgetName);
    expect(found).toBeDefined();
  });

  test("UpdateBudget", async () => {
    await client.send(new UpdateBudgetCommand({
      AccountId: ACCOUNT_ID,
      NewBudget: {
        BudgetName: budgetName,
        BudgetType: "COST",
        BudgetLimit: { Amount: "200", Unit: "USD" },
        TimeUnit: "MONTHLY",
      },
    }));

    const res = await client.send(new DescribeBudgetCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
    }));
    expect(res.Budget!.BudgetLimit!.Amount).toBe("200");
  });

  test("CreateNotification", async () => {
    await client.send(new CreateNotificationCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
      Notification: {
        NotificationType: "ACTUAL",
        ComparisonOperator: "GREATER_THAN",
        Threshold: 80,
        ThresholdType: "PERCENTAGE",
      },
      Subscribers: [
        { SubscriptionType: "EMAIL", Address: "test@example.com" },
      ],
    }));
  });

  test("DescribeNotificationsForBudget", async () => {
    const res = await client.send(new DescribeNotificationsForBudgetCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
    }));
    expect(res.Notifications).toBeDefined();
    expect(res.Notifications!.length).toBeGreaterThanOrEqual(1);
    expect(res.Notifications![0].NotificationType).toBe("ACTUAL");
    expect(res.Notifications![0].Threshold).toBe(80);
  });

  test("CreateSubscriber", async () => {
    await client.send(new CreateSubscriberCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
      Notification: {
        NotificationType: "ACTUAL",
        ComparisonOperator: "GREATER_THAN",
        Threshold: 80,
        ThresholdType: "PERCENTAGE",
      },
      Subscriber: { SubscriptionType: "SNS", Address: "arn:aws:sns:us-east-1:000000000000:budget-alerts" },
    }));
  });

  test("DescribeSubscribersForNotification", async () => {
    const res = await client.send(new DescribeSubscribersForNotificationCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
      Notification: {
        NotificationType: "ACTUAL",
        ComparisonOperator: "GREATER_THAN",
        Threshold: 80,
        ThresholdType: "PERCENTAGE",
      },
    }));
    expect(res.Subscribers).toBeDefined();
    expect(res.Subscribers!.length).toBe(2); // EMAIL + SNS
  });

  test("DeleteSubscriber", async () => {
    await client.send(new DeleteSubscriberCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
      Notification: {
        NotificationType: "ACTUAL",
        ComparisonOperator: "GREATER_THAN",
        Threshold: 80,
        ThresholdType: "PERCENTAGE",
      },
      Subscriber: { SubscriptionType: "SNS", Address: "arn:aws:sns:us-east-1:000000000000:budget-alerts" },
    }));
  });

  test("DeleteNotification", async () => {
    await client.send(new DeleteNotificationCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
      Notification: {
        NotificationType: "ACTUAL",
        ComparisonOperator: "GREATER_THAN",
        Threshold: 80,
        ThresholdType: "PERCENTAGE",
      },
    }));

    const res = await client.send(new DescribeNotificationsForBudgetCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
    }));
    expect(res.Notifications!.length).toBe(0);
  });

  test("DeleteBudget", async () => {
    await client.send(new DeleteBudgetCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: budgetName,
    }));

    await expect(
      client.send(new DescribeBudgetCommand({
        AccountId: ACCOUNT_ID,
        BudgetName: budgetName,
      })),
    ).rejects.toThrow();
  });

  test("CreateBudget - duplicate", async () => {
    await client.send(new CreateBudgetCommand({
      AccountId: ACCOUNT_ID,
      Budget: {
        BudgetName: "dup-budget",
        BudgetType: "COST",
        BudgetLimit: { Amount: "50", Unit: "USD" },
        TimeUnit: "MONTHLY",
      },
    }));

    await expect(
      client.send(new CreateBudgetCommand({
        AccountId: ACCOUNT_ID,
        Budget: {
          BudgetName: "dup-budget",
          BudgetType: "COST",
          BudgetLimit: { Amount: "50", Unit: "USD" },
          TimeUnit: "MONTHLY",
        },
      })),
    ).rejects.toThrow();

    // cleanup
    await client.send(new DeleteBudgetCommand({
      AccountId: ACCOUNT_ID,
      BudgetName: "dup-budget",
    }));
  });
});
