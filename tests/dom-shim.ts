// dom-shim.ts - Just enough DOM to run a module out of static/app.js.
//
// The browser code in static/app.js has never been tested. The pattern used for
// sw.js - copy the logic into the test file and assert on the copy - tests the
// copy, and this repo has already been bitten twice by things that were correct
// in one place and stale in another.
//
// So instead: extract the real source out of app.js, run it, and drive it with
// events. That needs a DOM, and deno_dom is not reachable from this environment.
// This is the smallest one that makes those modules runnable - element tree,
// compound selectors, class and dataset access, event dispatch with capture and
// a real `target`. It is deliberately not a DOM implementation: anything a
// module needs that is not here should be added here, with the same bias
// towards mechanical correctness over coverage.

/** A parsed compound selector, e.g. `li[data-story-id="7"]` or `a.title`. */
interface Compound {
  tag?: string;
  classes: string[];
  attrs: { name: string; value?: string }[];
}

const parseCompound = (selector: string): Compound => {
  const compound: Compound = { classes: [], attrs: [] };
  const pattern = /^(?:([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\])/;

  let rest = selector.trim();
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) throw new Error(`dom-shim cannot parse selector: ${selector}`);
    if (match[1]) compound.tag = match[1];
    else if (match[2]) compound.classes.push(match[2]);
    else compound.attrs.push({ name: match[3]!, value: match[4] });
    rest = rest.slice(match[0].length);
  }
  return compound;
};

/** `data-story-id` <-> `storyId`, the same mapping `dataset` uses. */
const camel = (attribute: string): string =>
  attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export class El {
  readonly tag: string;
  readonly attributes: Record<string, string>;
  readonly children: El[] = [];
  parent: El | null = null;
  /** Set by `focus()`, so tests can assert where focus landed. */
  focused = false;
  /** Arguments the module passed to `focus()`. */
  focusOptions: unknown = undefined;

  constructor(tag: string, attributes: Record<string, string> = {}, children: El[] = []) {
    this.tag = tag;
    this.attributes = attributes;
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  get classList() {
    const classes = (this.attributes.class ?? "").split(/\s+/).filter(Boolean);
    return { contains: (name: string) => classes.includes(name) };
  }

  get dataset(): Record<string, string> {
    const data: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.attributes)) {
      if (name.startsWith("data-")) data[camel(name)] = value;
    }
    return data;
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const compound = parseCompound(part);
      if (compound.tag && compound.tag !== this.tag) return false;
      if (!compound.classes.every((c) => this.classList.contains(c))) return false;
      return compound.attrs.every(({ name, value }) =>
        name in this.attributes && (value === undefined || this.attributes[name] === value)
      );
    });
  }

  closest(selector: string): El | null {
    // deno-lint-ignore no-this-alias
    let node: El | null = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }

  querySelector(selector: string): El | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  focus(options?: unknown): void {
    this.focused = true;
    this.focusOptions = options;
  }
}

/** Build an element tree. `el("a", { class: "title" }, el("span"))` */
export const el = (
  tag: string,
  attributes: Record<string, string> = {},
  ...children: El[]
): El => new El(tag, attributes, children);

export interface FakeEvent {
  type: string;
  target?: El;
  [key: string]: unknown;
}

type Listener = (event: FakeEvent) => void;

/**
 * A page: a document root, a URL, a sessionStorage, and event dispatch.
 *
 * Capture and bubble listeners both fire here, in registration order. That is
 * not what a browser does across a tree, but every listener these modules
 * register is on the global object, where the distinction does not arise.
 */
export class FakeWindow {
  readonly listeners = new Map<string, Listener[]>();
  readonly storage = new Map<string, string>();
  pathname: string;
  readonly root: El;
  /** Set to a value to make `navigation.activation.navigationType` report it. */
  navigationType: string | undefined;
  /** What `performance.getEntriesByType("navigation")[0].type` reports. */
  performanceNavigationType = "navigate";
  /** Whether `"onpagereveal" in globalThis` is true. */
  supportsPageReveal = true;

  constructor(pathname: string, root: El) {
    this.pathname = pathname;
    this.root = root;
  }

  dispatch(event: FakeEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }

  /** The globals a module extracted from app.js is run against. */
  globals = (): Record<string, unknown> => {
    const fake: Record<string, unknown> = {
      addEventListener: (type: string, listener: Listener) => {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
      },
      location: Object.defineProperty({}, "pathname", { get: () => this.pathname }),
      sessionStorage: {
        getItem: (key: string) => this.storage.get(key) ?? null,
        setItem: (key: string, value: string) => void this.storage.set(key, String(value)),
        removeItem: (key: string) => void this.storage.delete(key),
      },
      document: {
        querySelector: (selector: string) => this.root.querySelector(selector),
      },
      performance: {
        getEntriesByType: (type: string) =>
          type === "navigation" ? [{ type: this.performanceNavigationType }] : [],
      },
      CSS: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
    };

    // `navigation` and `onpagereveal` are feature detections, so they have to
    // be absent rather than undefined when the test is standing in for a
    // browser that lacks them.
    fake.globalThis = new Proxy(fake, {
      get: (target, property) => {
        if (property === "navigation") {
          return this.navigationType
            ? { activation: { navigationType: this.navigationType } }
            : undefined;
        }
        return Reflect.get(target, property);
      },
      has: (target, property) => {
        if (property === "onpagereveal") return this.supportsPageReveal;
        return Reflect.has(target, property);
      },
    });

    return fake;
  };
}

/**
 * Pull one `// --- Heading ---` section out of static/app.js.
 *
 * Extracting by heading rather than by line number means the test breaks
 * loudly if the module is renamed or removed, instead of silently testing a
 * neighbouring one.
 */
export async function moduleSource(heading: string): Promise<string> {
  const source = await Deno.readTextFile(new URL("../static/app.js", import.meta.url));
  const marker = `// --- ${heading} ---`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`static/app.js has no section "${heading}"`);

  const next = source.indexOf("\n// --- ", start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

/** Run a section of app.js against a `FakeWindow`. */
export async function runModule(heading: string, window: FakeWindow): Promise<void> {
  const globals = window.globals();
  const names = Object.keys(globals);
  new Function(...names, await moduleSource(heading))(...names.map((name) => globals[name]));
}
