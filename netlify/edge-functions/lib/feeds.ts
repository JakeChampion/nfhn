import { type FeedSlug } from "./hn.ts";

export type FeedConfig = {
  slug: FeedSlug;
  label: string;
  emptyTitle: string;
  emptyDescription: string;
};

export const FEEDS: FeedConfig[] = [
  {
    slug: "top",
    label: "Top",
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of top stories.",
  },
  {
    slug: "newest",
    label: "New",
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of new stories.",
  },
  {
    slug: "ask",
    label: "Ask",
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of Ask HN posts.",
  },
  {
    slug: "show",
    label: "Show",
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of Show HN posts.",
  },
  {
    slug: "jobs",
    label: "Jobs",
    emptyTitle: "No jobs found",
    emptyDescription: "We couldn't find that page of jobs.",
  },
];
