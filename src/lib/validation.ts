import { z } from "zod";
import { GOAL_KEYS } from "@/lib/constants";

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1, "Please enter your name").max(80),
  jobTitle: z.string().trim().max(120).optional().default(""),
  seniority: z.string().trim().max(60).optional().default(""),
  industry: z.string().trim().max(80).optional().default(""),
  goals: z.array(z.enum(GOAL_KEYS)).min(1, "Pick at least one goal").max(3),
  feedbackTone: z.enum(["direct", "balanced", "gentle"]).default("balanced"),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const raterSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().toLowerCase().email("Invalid email"),
});

export const groupKindSchema = z.enum(["MANAGER", "PEER", "DIRECT_REPORT", "CLIENT", "OTHER"]);

export const wizardSchema = z.object({
  title: z.string().trim().min(1).max(120),
  goal: z.enum(GOAL_KEYS),
  company: z.string().trim().max(80).optional(),
  frameworkId: z.string().min(1),
  questions: z
    .array(
      z.object({
        competencyKey: z.string().min(1),
        questionKey: z.string().nullable(),
        text: z.string().trim().min(5).max(300),
        selfText: z.string().trim().min(5).max(300),
      }),
    )
    .min(5, "Keep at least 5 questions")
    .max(60),
  groups: z
    .array(
      z.object({
        kind: groupKindSchema,
        name: z.string().trim().min(1).max(60),
        raters: z.array(raterSchema).max(50),
        shareLink: z.boolean().default(false),
      }),
    )
    .min(1, "Add at least one rater group"),
  inviteMessage: z.string().trim().min(10).max(2000),
  dueAt: z.string().nullable().optional(),
  minRatersPerGroup: z.number().int().min(3).max(10).default(3),
  showManagerSeparately: z.boolean().default(false),
});
export type WizardInput = z.infer<typeof wizardSchema>;

const rating = z.number().int().min(1).max(10).nullable();
const text = z.string().max(2000).optional().default("");

export const answersSchema = z.object({
  ratings: z.record(z.string(), rating),
  competencyComments: z.record(z.string(), z.string().max(2000)).optional().default({}),
  start: text,
  stop: text,
  continue: text,
  general: text,
  /** Rater asked for AI to remove identifying details from their comments before saving. */
  deidentify: z.boolean().optional().default(true),
});
export type Answers = z.infer<typeof answersSchema>;

export const draftSchema = answersSchema.extend({ step: z.number().int().min(0).max(100).default(0) });
export type Draft = z.infer<typeof draftSchema>;
