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

/** A parsed compound selector, e.g. `li[data-story-id="7"]` or `a.title:not([x])`. */
interface Compound {
  tag?: string;
  classes: string[];
  attrs: { name: string; value?: string }[];
  not: Compound[];
}

const parseCompound = (selector: string): Compound => {
  const compound: Compound = { classes: [], attrs: [], not: [] };
  const pattern =
    /^(?::not\(([^)]*)\)|([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\])/;

  let rest = selector.trim();
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) throw new Error(`dom-shim cannot parse selector: ${selector}`);
    if (match[1] !== undefined) compound.not.push(parseCompound(match[1]));
    else if (match[2]) compound.tag = match[2];
    else if (match[3]) compound.classes.push(match[3]);
    else if (match[4]) compound.attrs.push({ name: "id", value: match[4] });
    else compound.attrs.push({ name: match[5]!, value: match[6] });
    rest = rest.slice(match[0].length);
  }
  return compound;
};

/** A compound plus how it relates to the compound on its right. */
interface Step {
  compound: Compound;
  /** " " = descendant, ">" = direct child. Ignored on the rightmost step. */
  combinator: " " | ">";
}

/**
 * Split a complex selector into steps, ignoring spaces inside `:not(...)`.
 *
 * Descendant and child are supported, which is what these modules use. `+` and
 * `~` would each need their own traversal and are not here.
 */
const parseSteps = (selector: string): Step[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of selector.trim()) {
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (depth === 0 && (character === " " || character === ">")) {
      if (current) parts.push(current);
      if (character === ">") parts.push(">");
      current = "";
      continue;
    }
    current += character;
  }
  if (current) parts.push(current);

  const steps: Step[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === ">") continue;
    steps.push({
      compound: parseCompound(parts[i]!),
      combinator: parts[i + 1] === ">" ? ">" : " ",
    });
  }
  return steps;
};

/** `data-story-id` <-> `storyId`, the same mapping `dataset` uses. */
const camel = (attribute: string): string =>
  attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const kebab = (key: string): string =>
  `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export class El {
  readonly tag: string;
  readonly attributes: Record<string, string>;
  readonly children: El[] = [];
  parent: El | null = null;
  /** Text set through `textContent`, when this element has no children. */
  text = "";
  /** Set by `focus()`, so tests can assert where focus landed. */
  focused = false;
  /**
   * The namespace `createElementNS` was called with, if it was.
   *
   * An <svg> built with createElement lands in the XHTML namespace and renders as
   * nothing, which is invisible to every assertion about tags and attributes - so
   * the shim records which call built the node.
   */
  namespace: string | null = null;
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

  /** Live, and writable both ways - modules set and delete `dataset` keys. */
  get dataset(): Record<string, string | undefined> {
    return new Proxy({}, {
      get: (_target, key: string) => this.attributes[kebab(key)],
      set: (_target, key: string, value) => {
        this.attributes[kebab(String(key))] = String(value);
        return true;
      },
      deleteProperty: (_target, key: string) => {
        delete this.attributes[kebab(key)];
        return true;
      },
      has: (_target, key: string) => kebab(key) in this.attributes,
      ownKeys: () => Object.keys(this.attributes).filter((n) => n.startsWith("data-")).map(camel),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    }) as Record<string, string | undefined>;
  }

  get hidden(): boolean {
    return "hidden" in this.attributes;
  }

  set hidden(value: boolean) {
    if (value) this.attributes.hidden = "";
    else delete this.attributes.hidden;
  }

  /** Own text, or all descendant text when there are children. */
  get textContent(): string {
    if (!this.children.length) return this.text;
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.children.length = 0;
    this.text = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  // --- Building and moving nodes ---
  //
  // Needed since the saved list and the PiP reader stopped assigning innerHTML:
  // both build trees now, and code that is never exercised is code that is never
  // tested. `attributes` stays a plain record for everything else in here, so this
  // exposes the {name, value} view a sanitiser walk expects alongside it.

  get tagName(): string {
    return this.tag.toUpperCase();
  }

  get className(): string {
    return this.attributes.class ?? "";
  }

  set className(value: string) {
    this.attributes.class = value;
  }

  /**
   * A static list of attribute names, which is what a sanitiser walk wants.
   *
   * `node.attributes` is a live NamedNodeMap, so removing entries while iterating
   * it skips the next one. Client code uses this instead for that reason, and it
   * is also the part of the API this shim can honestly model.
   */
  getAttributeNames(): string[] {
    return Object.keys(this.attributes);
  }

  appendChild(child: El): El {
    child.parent?.removeChild(child);
    child.parent = this;
    // A node cannot hold both text and children, same as the real thing.
    this.text = "";
    this.children.push(child);
    return child;
  }

  append(...nodes: El[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  replaceChildren(...nodes: El[]): void {
    for (const child of this.children) child.parent = null;
    this.children.length = 0;
    this.text = "";
    for (const node of nodes) this.appendChild(node);
  }

  removeChild(child: El): void {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parent = null;
  }

  remove(): void {
    this.parent?.removeChild(this);
  }

  /** A deep copy, so an "imported" tree is not the same nodes as the source. */
  cloneNode(deep = false): El {
    const copy = new El(this.tag, { ...this.attributes });
    copy.text = this.text;
    copy.namespace = this.namespace;
    if (deep) { for (const child of this.children) copy.appendChild(child.cloneNode(true)); }
    return copy;
  }

  /** Elements only, which is all the shim models - there are no text nodes. */
  get childNodes(): El[] {
    return [...this.children];
  }

  get nodeType(): number {
    return 1;
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const steps = parseSteps(part);
      const last = steps.pop();
      if (!last || !this.matchesCompound(last.compound)) return false;

      // Ancestors, innermost first. A descendant combinator lets each one be
      // found anywhere above; a child combinator pins it to the direct parent.
      let node = this.parent;
      for (const step of steps.reverse()) {
        if (step.combinator === ">") {
          if (!node?.matchesCompound(step.compound)) return false;
        } else {
          while (node && !node.matchesCompound(step.compound)) node = node.parent;
          if (!node) return false;
        }
        node = node.parent;
      }
      return true;
    });
  }

  matchesCompound(compound: Compound): boolean {
    if (compound.tag && compound.tag !== this.tag) return false;
    if (!compound.classes.every((c) => this.classList.contains(c))) return false;
    if (compound.not.some((negated) => this.matchesCompound(negated))) return false;
    return compound.attrs.every(({ name, value }) =>
      name in this.attributes && (value === undefined || this.attributes[name] === value)
    );
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

  querySelectorAll(selector: string): El[] {
    const found: El[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  focus(options?: unknown): void {
    this.focused = true;
    this.focusOptions = options;
  }

  /** Listeners this element carries, for elements modules subscribe to directly. */
  readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  dispatch(event: FakeEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }

  /** Popovers. Presence of the method is itself a feature detection. */
  popoverOpen = false;
  showPopover(): void {
    this.popoverOpen = true;
  }
  hidePopover(): void {
    this.popoverOpen = false;
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
 * A stand-in for `EventSource`.
 *
 * Every instance is recorded on the class so a test can find the connection the
 * module opened, push events into it, and assert on whether it was closed. The
 * real one reconnects on its own; this one does not, because the behaviour
 * under test is what the module does around that, not the retry itself.
 */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  /** Every instance constructed, in order. Reset with `FakeEventSource.reset()`. */
  static instances: FakeEventSource[] = [];
  static reset() {
    FakeEventSource.instances = [];
  }

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  readonly listeners = new Map<string, ((event: { data?: string }) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Deliver a server event to the module. */
  emit(type: string, data?: unknown) {
    const payload = data === undefined ? undefined : JSON.stringify(data);
    for (const listener of this.listeners.get(type) ?? []) listener({ data: payload });
  }

  get closed() {
    return this.readyState === FakeEventSource.CLOSED;
  }
}

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
  /** Whether `HTMLAnchorElement.prototype` carries `interestForElement`. */
  supportsInterestInvokers = true;
  /** Whether `EventSource` exists at all. */
  supportsEventSource = true;
  /** Whether `document.visibilityState` reports "visible". */
  visible = true;
  /** Requests the module made, newest last. */
  readonly requests: string[] = [];
  /** Stand-in for the network. Replace per test. */
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<unknown> = () =>
    Promise.reject(new Error("no fetch handler installed"));

  constructor(pathname: string, root: El) {
    this.pathname = pathname;
    this.root = root;
  }

  dispatch(event: FakeEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }

  /** Dispatch to listeners registered on `document` rather than the window. */
  dispatchOnDocument(event: FakeEvent): void {
    for (const listener of this.listeners.get(`document:${event.type}`) ?? []) listener(event);
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
      document: Object.defineProperty(
        {
          querySelector: (selector: string) => this.root.querySelector(selector),
          querySelectorAll: (selector: string) => this.root.querySelectorAll(selector),
          getElementById: (id: string) => this.root.querySelector(`[id="${id}"]`),
          // Node building, for the modules that render DOM rather than markup.
          // The namespace is recorded rather than acted on: what matters to a test
          // is that an <svg> was created with createElementNS at all, since one made
          // with createElement lands in the wrong namespace and renders as nothing.
          createElement: (tag: string) => new El(tag),
          createElementNS: (namespace: string, tag: string) => {
            const node = new El(tag);
            node.namespace = namespace;
            return node;
          },
          importNode: (node: El, deep = false) => node.cloneNode(deep),
          addEventListener: (type: string, listener: Listener) => {
            const existing = this.listeners.get(`document:${type}`) ?? [];
            existing.push(listener);
            this.listeners.set(`document:${type}`, existing);
          },
          // Modules gated on `whenActivated` run immediately here; the prerender
          // path is exercised by passing a `whenActivated` that defers instead.
          prerendering: false,
          // A getter, so a test can flip `visible` after the module has run and
          // have the module see the new value.
        },
        "visibilityState",
        { get: () => (this.visible ? "visible" : "hidden") },
      ),
      whenActivated: (fn: () => void) => fn(),
      // Feature detections for interest invokers and popover. Set
      // `supportsInterestInvokers` to false to stand in for a browser without.
      HTMLAnchorElement: {
        prototype: this.supportsInterestInvokers ? { interestForElement: null } : {},
      },
      MutationObserver: class {
        constructor(private readonly callback: () => void) {}
        observe(target: El) {
          target.addEventListener("nfhn:mutate", () => this.callback());
        }
        disconnect() {}
      },
      fetch: (input: string, init?: { signal?: AbortSignal }) => {
        this.requests.push(input);
        return this.fetch(input, init);
      },
      EventSource: this.supportsEventSource ? FakeEventSource : undefined,
      encodeURIComponent,
      Number,
      Math,
      setTimeout,
      clearTimeout,
      AbortController,
      AbortSignal,
      Date,
      Error,
      JSON,
      // Modules that render timestamps borrow the one already in app.js.
      RelativeTime: { format: (date: Date) => `at ${date.toISOString()}` },
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
 * Pull one `// --- Heading ---` section out of a file in static/.
 *
 * Extracting by heading rather than by line number means the test breaks
 * loudly if the module is renamed or removed, instead of silently testing a
 * neighbouring one.
 */
export async function moduleSource(heading: string, file = "app.js"): Promise<string> {
  const source = await Deno.readTextFile(new URL(`../static/${file}`, import.meta.url));
  const marker = `// --- ${heading} ---`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`static/${file} has no section "${heading}"`);

  const next = source.indexOf("\n// --- ", start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

/** Run a section of app.js against a `FakeWindow`. */
export async function runModule(heading: string, window: FakeWindow): Promise<void> {
  const globals = window.globals();
  const names = Object.keys(globals);
  new Function(...names, await moduleSource(heading))(...names.map((name) => globals[name]));
}

/**
 * Run a section that declares functions rather than running an IIFE, and hand
 * the named ones back so a test can call them.
 *
 * Service worker code is written this way: top-level function declarations plus
 * event listeners. Returning the declarations is the only way to reach them
 * from outside without exporting from a file the browser loads as a classic
 * worker script.
 */
export async function runModuleReturning(
  heading: string,
  file: string,
  globals: Record<string, unknown>,
  returns: string[],
): Promise<Record<string, (...args: never[]) => unknown>> {
  const source = await moduleSource(heading, file);
  const names = Object.keys(globals);
  const body = `${source}\nreturn { ${returns.join(", ")} };`;
  return new Function(...names, body)(...names.map((name) => globals[name]));
}

/**
 * A `CacheStorage` with just what these modules use: open, match, put, delete.
 *
 * Entries are keyed by URL string. Request objects are reduced to their url,
 * which is what the real thing does for the default (no `ignoreSearch`) case.
 */
export class FakeCaches {
  readonly caches = new Map<string, Map<string, Response>>();

  open(name: string) {
    const existing = this.caches.get(name) ?? new Map<string, Response>();
    this.caches.set(name, existing);
    const key = (request: string | { url: string }) =>
      typeof request === "string" ? request : request.url;
    return Promise.resolve({
      match: (request: string | { url: string }) =>
        Promise.resolve(existing.get(key(request))?.clone()),
      put: (request: string | { url: string }, response: Response) => {
        existing.set(key(request), response);
        return Promise.resolve();
      },
      delete: (request: string | { url: string }) => Promise.resolve(existing.delete(key(request))),
    });
  }

  /** Everything stored under `name`, as URLs. */
  keysIn(name: string): string[] {
    return [...(this.caches.get(name)?.keys() ?? [])];
  }
}
