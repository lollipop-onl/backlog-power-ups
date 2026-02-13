export const nodeMatcher = <T extends HTMLElement>(
	selector: string,
	node: Node,
	elementType = HTMLElement,
): T[] => {
	if (!(node instanceof HTMLElement)) {
		return [];
	}

	const results: T[] = [];

	if (node.matches(selector) && node instanceof elementType) {
		results.push(node as T);
	}

	const descendants = node.querySelectorAll(selector);
	for (let i = 0; i < descendants.length; i++) {
		const el = descendants[i];
		if (el instanceof elementType) {
			results.push(el as T);
		}
	}

	return results;
};
