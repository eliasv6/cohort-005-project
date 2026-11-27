import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  courses,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refundRequests,
  RefundRequestStatus,
  videoWatchEvents,
} from "~/db/schema";
import { getDiscountForCountry } from "~/lib/ppp";
import { formatPrice } from "~/lib/utils";

// Everything about Refund Requests lives here: the Refund Eligibility rules,
// the queries that gather the facts they need, and the confirmation email.
// See GLOSSARY.md for the vocabulary.

export const REFUND_WINDOW_DAYS = 14;
const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundEligibilityFacts = {
  purchasedAt: string;
  amountPaid: number;
  purchaseCountry: string | null;
  coursePrice: number;
  secondsWatched: number;
  lessonsCompleted: number;
  totalLessons: number;
  isClaimedTeamSeat: boolean;
  hasPendingRefundRequest: boolean;
};

export type RefundIneligibleReason =
  | "window_closed"
  | "watched_too_much"
  | "completed_too_much"
  | "claimed_team_seat"
  | "request_pending";

export type RefundEligibility =
  | { eligible: true; amount: number; lastDayOfRefundWindow: string }
  | { eligible: false; reason: RefundIneligibleReason };

// The Refund Window is counted in whole calendar days, not hours — someone
// who buys at 23:00 still gets the whole of their fourteenth day.
function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function checkRefundEligibility(
  facts: RefundEligibilityFacts,
  today: Date
): RefundEligibility {
  if (facts.hasPendingRefundRequest) {
    return { eligible: false, reason: "request_pending" };
  }

  // A seat that came out of a team licence, and has been claimed, belongs to
  // the team — the learner cannot hand it back on their own.
  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed_team_seat" };
  }

  const purchasedAt = new Date(facts.purchasedAt);
  const lastDay = new Date(purchasedAt);
  lastDay.setDate(lastDay.getDate() + REFUND_WINDOW_DAYS);
  const lastDayOfRefundWindow = calendarDay(lastDay);
  const todayDay = calendarDay(today);

  if (todayDay < calendarDay(purchasedAt) || todayDay > lastDayOfRefundWindow) {
    return { eligible: false, reason: "window_closed" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "watched_too_much" };
  }

  if (
    facts.totalLessons > 0 &&
    facts.lessonsCompleted / facts.totalLessons >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "completed_too_much" };
  }

  // A purchase made at a purchasing-power price is given back at that price,
  // not at the list price of the course.
  const amount =
    getDiscountForCountry(facts.purchaseCountry) > 0
      ? facts.amountPaid
      : facts.coursePrice;

  return {
    eligible: true,
    amount,
    lastDayOfRefundWindow,
  };
}

/**
 * The confirmation the learner gets in their inbox once their Refund Request
 * is saved. There is no mail transport wired up yet, so the caller sends the
 * built message to the server log.
 */
export function buildRefundRequestedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `Your refund request is for ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

// ─── Database ───

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

// Watched time is the furthest position reached in each lesson, summed.
function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

function isClaimedTeamSeat(purchaseId: number) {
  const claimedSeat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();

  return claimedSeat !== undefined;
}

function getPendingRefundRequest(purchaseId: number) {
  return db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Pending)
      )
    )
    .get();
}

/** The learner's Pending Refund Requests, as listed on the settings page. */
export function getPendingRefundRequests(userId: number) {
  return db
    .select({
      id: refundRequests.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      amountPaid: purchases.amountPaid,
      reason: refundRequests.reason,
      requestedAt: refundRequests.requestedAt,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      and(
        eq(purchases.userId, userId),
        eq(refundRequests.status, RefundRequestStatus.Pending)
      )
    )
    .all();
}

/**
 * The Refund Eligibility of the learner's latest purchase of a course, or
 * null if they have not bought it.
 */
export function getRefundEligibility(
  userId: number,
  course: { id: number; price: number },
  today: Date = new Date()
): { purchaseId: number; eligibility: RefundEligibility } | null {
  const purchase = getLatestPurchase(userId, course.id);

  if (!purchase) return null;

  const lessonIds = getLessonIdsForCourse(course.id);

  const eligibility = checkRefundEligibility(
    {
      purchasedAt: purchase.createdAt,
      amountPaid: purchase.amountPaid,
      purchaseCountry: purchase.country,
      coursePrice: course.price,
      secondsWatched: getSecondsWatched(userId, lessonIds),
      lessonsCompleted: getCompletedLessonCount(userId, lessonIds),
      totalLessons: lessonIds.length,
      isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
      hasPendingRefundRequest:
        getPendingRefundRequest(purchase.id) !== undefined,
    },
    today
  );

  return { purchaseId: purchase.id, eligibility };
}

export function createRefundRequest(purchaseId: number, reason: string) {
  return db
    .insert(refundRequests)
    .values({
      purchaseId,
      status: RefundRequestStatus.Pending,
      reason,
    })
    .returning()
    .get();
}
