import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getCategoryUrl } from "@utils/url-utils.ts";

// // Retrieve posts and sort them by publication date
async function getRawSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const sorted = allBlogPosts.sort((a, b) => {
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});
	return sorted;
}

export async function getSortedPosts() {
	// Returns ZH posts only (lang !== "en") for the main listing.
	// The raw list (all languages) is used internally by EN-specific helpers.
	const sorted = await getRawSortedPosts();
	const zhSorted = sorted.filter((p) => p.data.lang !== "en");

	for (let i = 1; i < zhSorted.length; i++) {
		zhSorted[i].data.nextSlug = zhSorted[i - 1].slug;
		zhSorted[i].data.nextTitle = zhSorted[i - 1].data.title;
	}
	for (let i = 0; i < zhSorted.length - 1; i++) {
		zhSorted[i].data.prevSlug = zhSorted[i + 1].slug;
		zhSorted[i].data.prevTitle = zhSorted[i + 1].data.title;
	}

	return zhSorted;
}

/** Returns EN posts only, sorted by date, with EN-only prev/next links. */
export async function getSortedEnPosts() {
	const sorted = await getRawSortedPosts();
	const enSorted = sorted.filter((p) => p.data.lang === "en");

	for (let i = 1; i < enSorted.length; i++) {
		enSorted[i].data.nextSlug = enSorted[i - 1].slug;
		enSorted[i].data.nextTitle = enSorted[i - 1].data.title;
	}
	for (let i = 0; i < enSorted.length - 1; i++) {
		enSorted[i].data.prevSlug = enSorted[i + 1].slug;
		enSorted[i].data.prevTitle = enSorted[i + 1].data.title;
	}

	return enSorted;
}
export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
};
export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body
	const sortedPostsList = sortedFullPosts.map((post) => ({
		slug: post.slug,
		data: post.data,
	}));

	return sortedPostsList;
}
export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	const count: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { category: string } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}
