import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import {
  buildRefundRequestedEmail,
  createRefundRequest,
  getRefundEligibility,
  REFUND_WINDOW_DAYS,
  type RefundIneligibleReason,
} from "~/lib/refunds.server";

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

function refusal(reason: RefundIneligibleReason) {
  switch (reason) {
    case "request_pending":
      return data(
        "You already have a refund request pending on this purchase.",
        {
          status: 409,
        }
      );
    case "claimed_team_seat":
      return data(
        "A claimed team seat belongs to your team, so you cannot send a refund request for it.",
        { status: 403 }
      );
    case "window_closed":
      return data(
        `The ${REFUND_WINDOW_DAYS}-day Refund Window has closed, so you can no longer send a refund request.`,
        { status: 403 }
      );
    case "watched_too_much":
      return data(
        "You have watched too much of this course to send a refund request.",
        { status: 403 }
      );
    case "completed_too_much":
      return data(
        "You have completed too much of this course to send a refund request.",
        { status: 403 }
      );
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to send a refund request.", {
      status: 401,
    });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  const eligibility = getRefundEligibility(currentUserId, course);

  if (!eligibility) {
    throw data(
      "You have not bought this course, so there is nothing to send a refund request for.",
      { status: 403 }
    );
  }

  if (!eligibility.eligibility.eligible) {
    throw refusal(eligibility.eligibility.reason);
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  createRefundRequest(eligibility.purchaseId, parsed.data.reason);

  const email = buildRefundRequestedEmail({
    learnerName: learner.name,
    learnerEmail: learner.email,
    courseTitle: course.title,
    amount: eligibility.eligibility.amount,
  });

  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return redirect("/settings");
}
