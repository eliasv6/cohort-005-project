import { describe, it, expect } from "vitest";
import {
  buildRefundRequestedEmail,
  checkRefundEligibility,
  type RefundEligibilityFacts,
} from "./refunds.server";

// Dates are built in local time, because the Refund Window is counted in the
// learner's calendar days.
function localDate(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
) {
  return new Date(year, month - 1, day, hour, minute);
}

function makeFacts(
  overrides: Partial<RefundEligibilityFacts> = {}
): RefundEligibilityFacts {
  return {
    purchasedAt: localDate(2026, 3, 1).toISOString(),
    amountPaid: 7900,
    purchaseCountry: "US",
    coursePrice: 7900,
    secondsWatched: 0,
    lessonsCompleted: 0,
    totalLessons: 10,
    isClaimedTeamSeat: false,
    hasPendingRefundRequest: false,
    ...overrides,
  };
}

describe("checkRefundEligibility", () => {
  describe("Refund Window", () => {
    it("is eligible inside the window, with the amount and the last day of the window", () => {
      expect(
        checkRefundEligibility(makeFacts(), localDate(2026, 3, 5))
      ).toEqual({
        eligible: true,
        amount: 7900,
        lastDayOfRefundWindow: "2026-03-15",
      });
    });

    it("is eligible on the last day of the window", () => {
      const result = checkRefundEligibility(
        makeFacts(),
        localDate(2026, 3, 15, 23, 59)
      );
      expect(result.eligible).toBe(true);
    });

    it("is not eligible the day after the window closes", () => {
      expect(
        checkRefundEligibility(makeFacts(), localDate(2026, 3, 16, 0, 1))
      ).toEqual({ eligible: false, reason: "window_closed" });
    });

    it("gives a purchase made at 23:00 its full fourteenth day", () => {
      const facts = makeFacts({
        purchasedAt: localDate(2026, 3, 1, 23, 0).toISOString(),
      });
      expect(
        checkRefundEligibility(facts, localDate(2026, 3, 15, 23, 30))
      ).toEqual({
        eligible: true,
        amount: 7900,
        lastDayOfRefundWindow: "2026-03-15",
      });
    });
  });

  describe("watch limit", () => {
    const today = localDate(2026, 3, 5);

    it("is eligible one second under two hours watched", () => {
      const result = checkRefundEligibility(
        makeFacts({ secondsWatched: 7199 }),
        today
      );
      expect(result.eligible).toBe(true);
    });

    it("is not eligible at two hours watched", () => {
      expect(
        checkRefundEligibility(makeFacts({ secondsWatched: 7200 }), today)
      ).toEqual({ eligible: false, reason: "watched_too_much" });
    });
  });

  describe("completion limit", () => {
    const today = localDate(2026, 3, 5);

    it("is eligible just under half the lessons completed", () => {
      const result = checkRefundEligibility(
        makeFacts({ lessonsCompleted: 4, totalLessons: 9 }),
        today
      );
      expect(result.eligible).toBe(true);
    });

    it("is not eligible at half the lessons completed", () => {
      expect(
        checkRefundEligibility(
          makeFacts({ lessonsCompleted: 5, totalLessons: 10 }),
          today
        )
      ).toEqual({ eligible: false, reason: "completed_too_much" });
    });

    it("skips the completion check for a course with no lessons", () => {
      const result = checkRefundEligibility(
        makeFacts({ lessonsCompleted: 0, totalLessons: 0 }),
        today
      );
      expect(result.eligible).toBe(true);
    });
  });

  it("is not eligible for a claimed team seat", () => {
    expect(
      checkRefundEligibility(
        makeFacts({ isClaimedTeamSeat: true }),
        localDate(2026, 3, 5)
      )
    ).toEqual({ eligible: false, reason: "claimed_team_seat" });
  });

  it("is not eligible when a Refund Request is already Pending", () => {
    expect(
      checkRefundEligibility(
        makeFacts({ hasPendingRefundRequest: true }),
        localDate(2026, 3, 5)
      )
    ).toEqual({ eligible: false, reason: "request_pending" });
  });

  describe("amount", () => {
    const today = localDate(2026, 3, 5);

    it("is the amount paid for a purchase from a purchasing-power country", () => {
      expect(
        checkRefundEligibility(
          makeFacts({
            purchaseCountry: "IN",
            amountPaid: 3160,
            coursePrice: 7900,
          }),
          today
        )
      ).toEqual({
        eligible: true,
        amount: 3160,
        lastDayOfRefundWindow: "2026-03-15",
      });
    });

    it("is the course's list price for a purchase from a full-price country", () => {
      expect(
        checkRefundEligibility(
          makeFacts({
            purchaseCountry: "US",
            amountPaid: 6900,
            coursePrice: 7900,
          }),
          today
        )
      ).toEqual({
        eligible: true,
        amount: 7900,
        lastDayOfRefundWindow: "2026-03-15",
      });
    });
  });
});

describe("buildRefundRequestedEmail", () => {
  const email = buildRefundRequestedEmail({
    learnerName: "Liam",
    learnerEmail: "liam@example.com",
    courseTitle: "Introduction to TypeScript",
    amount: 7900,
  });

  it("is sent to the learner", () => {
    expect(email.to).toBe("liam@example.com");
  });

  it("is titled after the refund request and the course", () => {
    expect(email.subject).toBe("Refund requested — Introduction to TypeScript");
  });

  it("confirms the refund request and states the formatted amount", () => {
    expect(email.body).toContain("Hi Liam,");
    expect(email.body).toContain(
      'We have your refund request for "Introduction to TypeScript".'
    );
    expect(email.body).toContain(
      "The refund is for $79.00, the amount you paid."
    );
    expect(email.body).toContain(
      "Our team reviews every refund request by hand."
    );
  });

  it("never uses the words Reversal, Chargeback or Cancellation", () => {
    const text = `${email.subject}\n${email.body}`;
    expect(text).not.toMatch(/reversal|chargeback|cancel/i);
  });
});
