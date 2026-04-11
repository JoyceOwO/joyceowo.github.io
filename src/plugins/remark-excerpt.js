// biome-ignore lint/suspicious/noShadowRestrictedNames: <toString from mdast-util-to-string>
import { toString } from "mdast-util-to-string";

/* Use the post's first paragraph as the excerpt.
   Fallback order:
   1. First non-empty paragraph in the document
   2. First non-empty paragraph after the first heading
   3. First non-empty list item after the first heading */
export function remarkExcerpt() {
	return (tree, { data }) => {
		let excerpt = "";

		// Pass 1: first non-empty paragraph (original behaviour)
		for (const node of tree.children) {
			if (node.type === "paragraph") {
				const text = toString(node).trim();
				if (text) {
					excerpt = text;
					break;
				}
			}
		}

		// Pass 2: first non-empty paragraph or list item after the first heading
		if (!excerpt) {
			let pastHeading = false;
			for (const node of tree.children) {
				if (!pastHeading) {
					if (node.type.startsWith("heading")) {
						pastHeading = true;
					}
					continue;
				}
				if (
					node.type === "paragraph" ||
					node.type === "bulleted_list_item" ||
					node.type === "numbered_list_item" ||
					node.type === "list"
				) {
					const text = toString(node).trim();
					if (text) {
						excerpt = text;
						break;
					}
				}
			}
		}

		data.astro.frontmatter.excerpt = excerpt;
	};
}
