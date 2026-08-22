import type { tickets } from "@openhelpdesk/db";
import type { Condition, RuleEvent } from "./types";

type TicketRow = typeof tickets.$inferSelect;

export type EvalContext = {
  event: RuleEvent;
  ticket: TicketRow;
  now?: Date;
};

function fieldValue(ctx: EvalContext, field: Condition["field"]): unknown {
  const now = ctx.now ?? new Date();
  switch (field) {
    case "event":
      return ctx.event;
    case "status":
      return ctx.ticket.status;
    case "priority":
      return ctx.ticket.priority;
    case "channel":
      return ctx.ticket.channel;
    case "type":
      return ctx.ticket.type;
    case "team":
      return ctx.ticket.teamId;
    case "subject":
      return ctx.ticket.subject;
    case "tags":
      return ctx.ticket.tags;
    case "assignee":
      return ctx.ticket.assigneeId;
    case "organization":
      return ctx.ticket.organizationId;
    case "hours_since_created":
      return (now.getTime() - ctx.ticket.createdAt.getTime()) / 3_600_000;
    case "hours_since_updated":
      return (now.getTime() - ctx.ticket.updatedAt.getTime()) / 3_600_000;
  }
}

function evaluateOne(ctx: EvalContext, c: Condition): boolean {
  const value = fieldValue(ctx, c.field);
  switch (c.operator) {
    case "is":
      return String(value ?? "") === String(c.value ?? "");
    case "is_not":
      return String(value ?? "") !== String(c.value ?? "");
    case "contains":
      return typeof value === "string" && value.toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "includes":
      return Array.isArray(value) && value.includes(String(c.value ?? ""));
    case "empty":
      return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    case "not_empty":
      return !(value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0));
    case "gte":
      return typeof value === "number" && value >= Number(c.value);
    case "lte":
      return typeof value === "number" && value <= Number(c.value);
  }
}

/** IF block: "all" the conditions AND "at least one" (ST-05 specs). */
export function evaluateConditions(
  ctx: EvalContext,
  conditionsAll: Condition[],
  conditionsAny: Condition[],
): boolean {
  const all = conditionsAll.every((c) => evaluateOne(ctx, c));
  const any = conditionsAny.length === 0 || conditionsAny.some((c) => evaluateOne(ctx, c));
  return all && any;
}
