// biome-ignore lint/suspicious/noShadowRestrictedNames: <toString from mdast-util-to-string>
import { toString } from "mdast-util-to-string";

/* Use the first non-empty paragraph or list item after the first heading
   as the excerpt. */
export function remarkExcerpt() {
	return (tree, { data }) => {
		let excerpt = "";
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

		data.astro.frontmatter.excerpt = excerpt;
	};
}
