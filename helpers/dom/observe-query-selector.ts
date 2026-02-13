import { minimatch } from "minimatch";
import { nodeMatcher } from "./node-matcher.ts";
import type { InvalidateFunction } from "./types.ts";

export type Listener = (
	el: HTMLElement,
) => InvalidateFunction | void | Promise<void>;

const handlersMap: Map<
	Listener,
	{
		selector: string;
		onInvalidate: InvalidateFunction;
		elementsMap: Map<HTMLElement, InvalidateFunction>;
		matches: string[] | undefined;
	}
> = new Map();

// Cache minimatch results per pathname to avoid repeated pattern matching
let cachedPathname: string | undefined;
let cachedMatchResults: Map<string, boolean> = new Map();

const isPathnameMatched = (matches: string[]): boolean => {
	const { pathname } = location;

	if (pathname !== cachedPathname) {
		cachedPathname = pathname;
		cachedMatchResults = new Map();
	}

	return matches.some((match) => {
		let result = cachedMatchResults.get(match);
		if (result === undefined) {
			result = minimatch(pathname, match);
			cachedMatchResults.set(match, result);
		}
		return result;
	});
};

// Batch pending mutations and process them in a microtask
let pendingMutations: MutationRecord[] = [];
let isBatchScheduled = false;

const processBatch = () => {
	isBatchScheduled = false;

	const mutations = pendingMutations;
	pendingMutations = [];

	// Collect all added and removed nodes across the batch
	const addedNodes: Node[] = [];
	let hasRemovals = false;

	for (const mutation of mutations) {
		if (mutation.type !== "childList") continue;

		for (let i = 0; i < mutation.addedNodes.length; i++) {
			addedNodes.push(mutation.addedNodes[i]);
		}

		if (mutation.removedNodes.length > 0) {
			hasRemovals = true;
		}
	}

	// Nothing to process
	if (addedNodes.length === 0 && !hasRemovals) return;

	for (const [handler, { selector, elementsMap, matches = [] }] of handlersMap) {
		if (addedNodes.length > 0 && isPathnameMatched(matches)) {
			for (const node of addedNodes) {
				for (const el of nodeMatcher(selector, node)) {
					if (elementsMap.has(el)) continue;

					const invalidate = handler(el);

					if (typeof invalidate === "function") {
						elementsMap.set(el, invalidate);
					}
				}
			}
		}

		if (hasRemovals) {
			for (const [el, invalidate] of elementsMap) {
				if (!el.isConnected) {
					invalidate?.();
					elementsMap.delete(el);
				}
			}
		}
	}
};

const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		pendingMutations.push(mutation);
	}

	if (!isBatchScheduled) {
		isBatchScheduled = true;
		queueMicrotask(processBatch);
	}
});

observer.observe(document.documentElement, { childList: true, subtree: true });

export const observeQuerySelector = (
	selector: string,
	handler: Listener,
	matches: string[],
) => {
	const invalidateSet = new Set<InvalidateFunction>();

	const onInvalidate = () => {
		for (const invalidate of invalidateSet) {
			invalidate();
		}
		invalidateSet.clear();
	};

	handlersMap.set(handler, {
		selector,
		onInvalidate,
		matches,
		elementsMap: new Map(),
	});

	for (const el of nodeMatcher(selector, document.documentElement)) {
		const invalidate = handler(el);

		if (typeof invalidate === "function") {
			invalidateSet.add(invalidate);
		}
	}

	return () => {
		onInvalidate();
		handlersMap.delete(handler);
	};
};
