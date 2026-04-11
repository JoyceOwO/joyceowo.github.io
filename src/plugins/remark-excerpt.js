// biome-ignore lint/suspicious/noShadowRestrictedNames: <toString from mdast-util-to-string>
import { toString } from "mdast-util-to-string";

/* Use the post's first paragraph as the excerpt.
   If no standalone paragraph is found, fall back to the first
   non-empty paragraph that follows the first heading. */
export function remarkExcerpt() {
	return (tree, { data }) => {
		let excerpt = "";
		let foundHeading = false;

		for (const node of tree.children) {
			if (node.type === "paragraph") {
				const text = toString(node).trim();
				if (text) {
					excerpt = text;
					break;
				}
				continue;
			}

			if (!foundHeading && node.type.startsWith("heading")) {
				foundHeading = true;
				continue;
			}

			// After the first heading, keep scanning for a paragraph
			if (foundHeading) {
				continue;
			}
		}

		// If nothing found yet, scan children after first heading for a paragraph
		if (!excerpt) {
			let pastHeading = false;
			for (const node of tree.children) {
				if (!pastHeading && node.type.startsWith("heading")) {
					pastHeading = true;
					continue;
				}
				if (pastHeading && node.type === "paragraph") {
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
