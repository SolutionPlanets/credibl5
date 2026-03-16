import {
  BarChart3,
  Bell,
  CircleHelp,
  Download,
  MessageCircle,
  Search,
  Sparkles,
  Star,
  Store,
  Users,
  Youtube,
} from "lucide-react";

import type { OnboardingDraft, SelectableItem } from "@/components/onboarding/types";

export const TOTAL_STEPS = 4;
export const STEP_LABELS = ["Company Info", "Your Goals", "How You Found Us", "Connect With"];

export const DEFAULT_DRAFT: OnboardingDraft = {
  companyName: "",
  websiteUrl: "",
  useCase: "own_business",
  goals: [],
  source: "",
  sourceOtherText: "",
};

export const GOAL_OPTIONS: SelectableItem[] = [
  {
    id: "get-more-reviews",
    title: "Get more reviews",
    description: "Increase review volume with automated invitations.",
    icon: Star,
  },
  {
    id: "reply-with-ai",
    title: "Reply to reviews with or without AI",
    description: "Stay on top of new reviews and reply quickly.",
    icon: MessageCircle,
  },
  {
    id: "analyze-sentiment",
    title: "Analyze sentiment with AI",
    description: "Understand customer feedback with AI insights.",
    icon: BarChart3,
  },
  {
    id: "automate-reporting",
    title: "Automate reporting",
    description: "Schedule reports and share with your team.",
    icon: Bell,
  },
  {
    id: "alerts",
    title: "Monitor and set up alerts",
    description: "Get notified about new reviews from any platform.",
    icon: Sparkles,
  },
  {
    id: "download",
    title: "Download reviews to Excel",
    description: "Aggregate and download reviews into spreadsheets.",
    icon: Download,
  },
];

export const SOURCE_OPTIONS: SelectableItem[] = [
  {
    id: "google-search",
    title: "Google search",
    description: "Found us while searching online.",
    icon: Search,
  },
  {
    id: "youtube",
    title: "YouTube",
    description: "Saw a video or advertisement.",
    icon: Youtube,
  },
  {
    id: "ai-assistant",
    title: "ChatGPT, Gemini, etc.",
    description: "AI assistant recommended us.",
    icon: Sparkles,
  },
  {
    id: "word-of-mouth",
    title: "Word of mouth",
    description: "Friend or colleague told me.",
    icon: Users,
  },
  {
    id: "marketplace",
    title: "Marketplace listing",
    description: "Found us in a partner marketplace.",
    icon: Store,
  },
  {
    id: "other",
    title: "Other",
    description: "I will specify below.",
    icon: CircleHelp,
  },
];
