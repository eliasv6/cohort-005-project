// PROTOTYPE, throwaway. Fake notifications for "Prototype: where notifications
// surface in the app" (wayfinder ticket #6). Shapes follow the catalogue in
// "Grilling: the notification catalogue" (#5). Course and lesson names/ids are
// the seeded ones so links navigate to real pages.

export type Kind =
  | "answered" // 1
  | "reply" // 2
  | "new-material" // 3 (undecided, #7)
  | "refund" // 4
  | "not-started" // 5
  | "inactive" // 6
  | "milestone" // 7
  | "completed" // 9
  | "new-question" // 10
  | "instructor-reply" // 11
  | "course-activity"; // 12

export type Group = "discussion" | "progress" | "course" | "activity";

export const groupOf: Record<Kind, Group> = {
  answered: "discussion",
  reply: "discussion",
  "new-question": "discussion",
  "instructor-reply": "discussion",
  "not-started": "progress",
  inactive: "progress",
  milestone: "progress",
  completed: "progress",
  refund: "course",
  "new-material": "course",
  "course-activity": "activity",
};

export interface Activity {
  enrollments: number;
  ratings: number[]; // star values
  completed: number;
}

export interface ProtoNotification {
  id: string;
  kind: Kind;
  actor?: string;
  verb: string;
  target: string;
  course: string;
  courseId: number;
  href: string;
  cta?: string; // button label for card-style surfaces
  ageMinutes: number;
  read: boolean;
  seen: boolean;
  activity?: Activity;
}

const TS = { id: 1, slug: "introduction-to-typescript", title: "Introduction to TypeScript" };
const API = { id: 2, slug: "building-rest-apis-with-nodejs", title: "Building REST APIs with Node.js" };
const DS = { id: 3, slug: "design-systems-with-tailwind", title: "Design Systems with Tailwind" };
const DV = { id: 4, slug: "practical-data-visualisation", title: "Practical Data Visualisation" };
const K8S = { id: 5, slug: "shipping-with-docker-and-kubernetes", title: "Shipping with Docker and Kubernetes" };

const lesson = (c: { slug: string }, id: number, q?: number) =>
  `/courses/${c.slug}/lessons/${id}${q ? `#question-${q}` : ""}`;

let seq = 0;
const n = (p: Omit<ProtoNotification, "id" | "seen"> & { seen?: boolean }): ProtoNotification => ({
  id: `n${++seq}`,
  seen: p.read,
  ...p,
});

export function activitySummary(a: Activity) {
  const parts: string[] = [];
  if (a.enrollments) parts.push(`${a.enrollments} new Enrollment${a.enrollments > 1 ? "s" : ""}`);
  if (a.ratings.length)
    parts.push(`${a.ratings.length} rating${a.ratings.length > 1 ? "s" : ""} (${a.ratings.map((r) => `★${r}`).join(", ")})`);
  if (a.completed) parts.push(`${a.completed} Completed`);
  return parts.join(", ");
}

export function studentFeed(): ProtoNotification[] {
  return [
    n({ kind: "answered", actor: "Sarah Chen", verb: "answered your question on", target: "Generics Basics", course: TS.title, courseId: TS.id, href: lesson(TS, 9, 41), cta: "Read the Answer", ageMinutes: 12, read: false }),
    n({ kind: "reply", actor: "James Park", verb: "replied to a question on", target: "Generics Basics", course: TS.title, courseId: TS.id, href: lesson(TS, 9, 41), cta: "View thread", ageMinutes: 40, read: false }),
    n({ kind: "milestone", verb: "You're halfway through", target: TS.title, course: TS.title, courseId: TS.id, href: lesson(TS, 10), cta: "Next: Generic Constraints", ageMinutes: 190, read: false }),
    n({ kind: "inactive", verb: "Pick up where you left off in", target: `${API.title}: Express Router`, course: API.title, courseId: API.id, href: lesson(API, 24), cta: "Resume Express Router", ageMinutes: 60 * 26, read: true }),
    n({ kind: "refund", verb: "Your refund request was declined for", target: DS.title, course: DS.title, courseId: DS.id, href: `/courses/${DS.slug}`, ageMinutes: 60 * 50, read: true }),
    n({ kind: "not-started", verb: `You're enrolled in ${DV.title}. Start with`, target: "Encodings and What They Say", course: DV.title, courseId: DV.id, href: lesson(DV, 49), cta: "Start the course", ageMinutes: 60 * 24 * 4, read: true }),
    n({ kind: "completed", verb: "You completed", target: `${K8S.title}! How was it?`, course: K8S.title, courseId: K8S.id, href: `/courses/${K8S.slug}?rate=1`, cta: "Rate the course", ageMinutes: 60 * 24 * 9, read: true }),
  ];
}

export function instructorFeed(): ProtoNotification[] {
  return [
    n({ kind: "new-question", actor: "Emma Wilson", verb: "asked a question on", target: "Generics Basics", course: TS.title, courseId: TS.id, href: "/instructor/questions", cta: "Answer", ageMinutes: 5, read: false }),
    n({ kind: "instructor-reply", actor: "James Park", verb: "replied in a thread on", target: "Utility Types", course: TS.title, courseId: TS.id, href: lesson(TS, 11, 12), cta: "View thread", ageMinutes: 65, read: false }),
    n({ kind: "course-activity", verb: "", target: TS.title, course: TS.title, courseId: TS.id, href: `/instructor/${TS.id}/students`, cta: "See Students", ageMinutes: 120, read: false, activity: { enrollments: 4, ratings: [5, 3], completed: 1 } }),
    n({ kind: "new-question", actor: "Liam Thompson", verb: "asked a question on", target: "What a Design System Is For", course: DS.title, courseId: DS.id, href: "/instructor/questions", cta: "Answer", ageMinutes: 60 * 27, read: true }),
    n({ kind: "course-activity", verb: "", target: DS.title, course: DS.title, courseId: DS.id, href: `/instructor/${DS.id}/students`, cta: "See Students", ageMinutes: 60 * 74, read: true, activity: { enrollments: 2, ratings: [4], completed: 0 } }),
  ];
}

// What "Simulate arrival" pushes, in order, cycling.
export type Arrival =
  | { type: "new"; make: () => ProtoNotification }
  | { type: "activity"; courseId: number; course: string; delta: Partial<Activity> };

export const studentArrivals: Arrival[] = [
  { type: "new", make: () => n({ kind: "reply", actor: "Olivia Martinez", verb: "replied to a question on", target: "Type Guards and Narrowing", course: TS.title, courseId: TS.id, href: lesson(TS, 13, 77), cta: "View thread", ageMinutes: 0, read: false }) },
  { type: "new", make: () => n({ kind: "answered", actor: "Sarah Chen", verb: "answered your question on", target: "Utility Types", course: TS.title, courseId: TS.id, href: lesson(TS, 11, 12), cta: "Read the Answer", ageMinutes: 0, read: false }) },
  { type: "new", make: () => n({ kind: "new-material", verb: `New lesson in ${TS.title}:`, target: "The satisfies Operator (wording TBD in #7)", course: TS.title, courseId: TS.id, href: `/courses/${TS.slug}`, cta: "Watch it", ageMinutes: 0, read: false }) },
];

export const instructorArrivals: Arrival[] = [
  { type: "new", make: () => n({ kind: "new-question", actor: "Olivia Martinez", verb: "asked a question on", target: "Mapped Types", course: TS.title, courseId: TS.id, href: "/instructor/questions", cta: "Answer", ageMinutes: 0, read: false }) },
  { type: "activity", courseId: TS.id, course: TS.title, delta: { enrollments: 1 } },
  { type: "activity", courseId: DS.id, course: DS.title, delta: { ratings: [5] } },
];

export function newActivityNotification(courseId: number, course: string, delta: Partial<Activity>): ProtoNotification {
  return n({
    kind: "course-activity",
    verb: "",
    target: course,
    course,
    courseId,
    href: `/instructor/${courseId}/students`,
    cta: "See Students",
    ageMinutes: 0,
    read: false,
    activity: { enrollments: 0, ratings: [], completed: 0, ...delta },
  });
}

export function formatAge(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / (60 * 24))}d ago`;
}

export function dayBucket(m: number) {
  if (m < 60 * 24) return "Today";
  if (m < 60 * 48) return "Yesterday";
  return "Earlier";
}
