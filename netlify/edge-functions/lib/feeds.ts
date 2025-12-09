import {
  fetchAskStoriesPage,
  fetchJobsStoriesPage,
  fetchShowStoriesPage,
  fetchTopStoriesPage,
  type Item,
} from "./hn.ts";

export type FeedSlug = "top" | "ask" | "show" | "jobs";

export type FeedConfig = {
  slug: FeedSlug;
  navLabel: string;
  pattern: RegExp;
  fetchPage: (pageNumber: number) => Promise<Item[]>;
  emptyTitle: string;
  emptyDescription: string;
  canonicalPath: (pageNumber: number) => string;
  logLabel: string;
};

export const feedConfigs: FeedConfig[] = [
  {
    slug: "top",
    navLabel: "Top",
    pattern: /^\/top\/(\d+)$/,
    fetchPage: fetchTopStoriesPage,
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of top stories.",
    canonicalPath: (pageNumber) => `/top/${pageNumber}`,
    logLabel: "Top stories",
  },
  {
    slug: "ask",
    navLabel: "Ask",
    pattern: /^\/ask\/(\d+)$/,
    fetchPage: fetchAskStoriesPage,
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of Ask HN posts.",
    canonicalPath: (pageNumber) => `/ask/${pageNumber}`,
    logLabel: "Ask stories",
  },
  {
    slug: "show",
    navLabel: "Show",
    pattern: /^\/show\/(\d+)$/,
    fetchPage: fetchShowStoriesPage,
    emptyTitle: "No stories found",
    emptyDescription: "We couldn't find that page of Show HN posts.",
    canonicalPath: (pageNumber) => `/show/${pageNumber}`,
    logLabel: "Show stories",
  },
  {
    slug: "jobs",
    navLabel: "Jobs",
    pattern: /^\/jobs\/(\d+)$/,
    fetchPage: fetchJobsStoriesPage,
    emptyTitle: "No jobs found",
    emptyDescription: "We couldn't find that page of jobs.",
    canonicalPath: (pageNumber) => `/jobs/${pageNumber}`,
    logLabel: "Jobs stories",
  },
];
