/**
 * Built-in competency framework: "Mirror Core 360" v1.
 * `text` is shown to raters ({name} is replaced by the subject's first name),
 * `selfText` is shown in the self-assessment.
 */
export type FrameworkQuestionDef = { key: string; text: string; selfText: string };
export type FrameworkCompetencyDef = {
  key: string;
  name: string;
  description: string;
  questions: FrameworkQuestionDef[];
};
export type FrameworkDef = {
  slug: string;
  version: number;
  name: string;
  description: string;
  competencies: FrameworkCompetencyDef[];
};

export const CORE_360: FrameworkDef = {
  slug: "mirror-core-360",
  version: 1,
  name: "Mirror Core 360",
  description:
    "Seven research-informed competencies that matter in almost any role: leadership, communication, execution, collaboration, strategic thinking, emotional intelligence and growth mindset.",
  competencies: [
    {
      key: "leadership",
      name: "Leadership",
      description: "Sets direction, takes ownership and helps others do their best work.",
      questions: [
        { key: "direction", text: "{name} sets a clear direction that others can follow.", selfText: "I set a clear direction that others can follow." },
        { key: "ownership", text: "{name} takes ownership of outcomes, including mistakes.", selfText: "I take ownership of outcomes, including mistakes." },
        { key: "develops", text: "{name} helps the people around them grow.", selfText: "I help the people around me grow." },
        { key: "delegates", text: "{name} delegates effectively and trusts others with real responsibility.", selfText: "I delegate effectively and trust others with real responsibility." },
      ],
    },
    {
      key: "communication",
      name: "Communication",
      description: "Shares ideas clearly, listens well and adapts to the audience.",
      questions: [
        { key: "clarity", text: "{name} communicates ideas clearly and concisely.", selfText: "I communicate ideas clearly and concisely." },
        { key: "listening", text: "{name} listens carefully before responding.", selfText: "I listen carefully before responding." },
        { key: "adapts", text: "{name} adapts their message to the audience.", selfText: "I adapt my message to the audience." },
        { key: "informs", text: "{name} keeps the right people informed.", selfText: "I keep the right people informed." },
      ],
    },
    {
      key: "execution",
      name: "Execution",
      description: "Delivers results reliably, prioritises well and follows through.",
      questions: [
        { key: "delivers", text: "{name} delivers on commitments and deadlines.", selfText: "I deliver on commitments and deadlines." },
        { key: "prioritises", text: "{name} focuses on what matters most.", selfText: "I focus on what matters most." },
        { key: "quality", text: "{name} produces high-quality work.", selfText: "I produce high-quality work." },
        { key: "obstacles", text: "{name} removes obstacles instead of waiting for them to clear.", selfText: "I remove obstacles instead of waiting for them to clear." },
      ],
    },
    {
      key: "collaboration",
      name: "Collaboration",
      description: "Works across boundaries, builds trust and shares credit.",
      questions: [
        { key: "trust", text: "{name} builds trusting relationships.", selfText: "I build trusting relationships." },
        { key: "credit", text: "{name} shares credit and recognises others' contributions.", selfText: "I share credit and recognise others' contributions." },
        { key: "conflict", text: "{name} handles disagreement constructively.", selfText: "I handle disagreement constructively." },
        { key: "boundaries", text: "{name} works well with people outside their own team.", selfText: "I work well with people outside my own team." },
      ],
    },
    {
      key: "strategic_thinking",
      name: "Strategic thinking",
      description: "Sees the bigger picture, anticipates and makes sound decisions.",
      questions: [
        { key: "big_picture", text: "{name} connects day-to-day work to the bigger picture.", selfText: "I connect day-to-day work to the bigger picture." },
        { key: "anticipates", text: "{name} anticipates problems and opportunities early.", selfText: "I anticipate problems and opportunities early." },
        { key: "decisions", text: "{name} makes sound decisions with incomplete information.", selfText: "I make sound decisions with incomplete information." },
        { key: "tradeoffs", text: "{name} explains the trade-offs behind their choices.", selfText: "I explain the trade-offs behind my choices." },
      ],
    },
    {
      key: "emotional_intelligence",
      name: "Emotional intelligence",
      description: "Understands own and others' emotions and stays composed.",
      questions: [
        { key: "composure", text: "{name} stays composed under pressure.", selfText: "I stay composed under pressure." },
        { key: "empathy", text: "{name} shows empathy and understands others' perspectives.", selfText: "I show empathy and understand others' perspectives." },
        { key: "self_awareness", text: "{name} is aware of how their behaviour affects others.", selfText: "I am aware of how my behaviour affects others." },
        { key: "safety", text: "{name} makes it safe for others to speak up.", selfText: "I make it safe for others to speak up." },
      ],
    },
    {
      key: "growth_mindset",
      name: "Growth mindset",
      description: "Seeks feedback, learns quickly and embraces challenges.",
      questions: [
        { key: "seeks_feedback", text: "{name} actively seeks feedback.", selfText: "I actively seek feedback." },
        { key: "learns", text: "{name} learns quickly from mistakes.", selfText: "I learn quickly from mistakes." },
        { key: "challenges", text: "{name} takes on challenges outside their comfort zone.", selfText: "I take on challenges outside my comfort zone." },
        { key: "open", text: "{name} is open to ideas that differ from their own.", selfText: "I am open to ideas that differ from my own." },
      ],
    },
  ],
};

export const RATING_LABELS: Record<number, string> = {
  1: "Rarely",
  2: "Sometimes",
  3: "Often",
  4: "Very often",
  5: "Almost always",
};

export function personalise(text: string, firstName: string) {
  return text.replaceAll("{name}", firstName);
}
