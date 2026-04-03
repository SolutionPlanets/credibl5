export interface BrandVoice {
  id: string;
  business_name: string;
  tone: string;
  key_phrases: string[];
  phrases_to_avoid: string[];
  signature_signoff: string;
  target_audience: string;
  brand_values: string;
  industry: string;
  preferred_response_length: string;
  language_dialect: string;
  example_responses: string[];
}

export interface GeneratedTemplate {
  title: string;
  content: string;
  review_type: "positive" | "negative" | "neutral";
}

function getLengthGuide(length: string): { min: number; max: number } {
  switch (length) {
    case "short":
      return { min: 1, max: 2 };
    case "detailed":
      return { min: 4, max: 5 };
    default:
      return { min: 2, max: 3 };
  }
}

function buildGreeting(tone: string): string {
  switch (tone) {
    case "formal":
      return "Dear valued customer,";
    case "casual":
      return "Hey there!";
    case "friendly":
      return "Hi! Thanks so much for your review!";
    default:
      return "Thank you for taking the time to share your feedback.";
  }
}

function buildClosing(tone: string, signoff: string): string {
  if (signoff.trim()) return signoff;
  switch (tone) {
    case "formal":
      return "Sincerely, The Management Team";
    case "casual":
      return "Cheers!";
    case "friendly":
      return "We appreciate you! See you again soon!";
    default:
      return "Best regards, The Team";
  }
}

export function generateMockTemplates(brandVoice: BrandVoice): GeneratedTemplate[] {
  const { tone, key_phrases, signature_signoff, business_name, industry } = brandVoice;
  const greeting = buildGreeting(tone);
  const closing = buildClosing(tone, signature_signoff);
  const phraseInsert =
    key_phrases.length > 0
      ? ` We pride ourselves on ${key_phrases.slice(0, 2).join(" and ")}.`
      : "";
  const industryMention = industry ? ` in the ${industry} space` : "";

  return [
    {
      title: "Positive Review Response",
      review_type: "positive",
      content: `${greeting}\n\nWe're thrilled to hear about your wonderful experience with ${business_name}${industryMention}!${phraseInsert} Your kind words truly mean the world to our team and motivate us to keep delivering the best.\n\nWe look forward to serving you again soon!\n\n${closing}`,
    },
    {
      title: "Negative Review Response",
      review_type: "negative",
      content: `${greeting}\n\nWe sincerely apologize that your experience with ${business_name} did not meet your expectations. Your feedback is invaluable and we take it very seriously.${phraseInsert}\n\nWe would love the opportunity to make things right. Please reach out to us directly so we can address your concerns personally.\n\n${closing}`,
    },
    {
      title: "Neutral Review Response",
      review_type: "neutral",
      content: `${greeting}\n\nThank you for sharing your experience with ${business_name}${industryMention}. We appreciate your honest feedback and are always looking for ways to improve.${phraseInsert}\n\nIf there's anything specific we can do better, please don't hesitate to let us know. We'd love to exceed your expectations on your next visit!\n\n${closing}`,
    },
  ];
}
