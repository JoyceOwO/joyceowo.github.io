/**
 * Notion → Fuwari Blog 同步腳本
 *
 * 從 Notion 抓取已發佈文章，轉換為 Fuwari 格式的 Markdown，
 * 存入 src/content/posts/ 目錄。
 *
 * 兩種模式：
 *   模式 A（有 DATABASE_ID）：從指定 Database 查詢，支援 Relation 過濾
 *   模式 B（無 DATABASE_ID）：用 Search API 搜尋整個 workspace
 *
 * 環境變數：
 *   NOTION_TOKEN          - Notion Integration Token（必填）
 *   NOTION_DATABASE_ID    - Notion Database ID（可選，有填用模式 A，沒填用模式 B）
 *   BLOG_PAGE_RELATION_ID - BLOG 關聯頁面 ID（可選，過濾 Category Relation）
 *   SYNC_WINDOW_HOURS     - 同步時間窗口，預設 25 小時（抓近一天有異動的頁面）
 *   BLOG_AUTHOR           - 作者名稱（可選）
 */

import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(PROJECT_ROOT, "src", "content", "posts");
const IMAGES_DIR = path.join(PROJECT_ROOT, "src", "assets", "notion-images");
const SYNC_STATE_FILE = path.join(PROJECT_ROOT, ".sync-state.json");

const NOTION_API_VERSION = "2022-06-28";
const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || "";
const BLOG_PAGE_RELATION_ID = process.env.BLOG_PAGE_RELATION_ID || "";
// 同步時間窗口（小時），預設 25 小時（涵蓋一天，留 1 小時緩衝）
const SYNC_WINDOW_HOURS = Number(process.env.SYNC_WINDOW_HOURS) || 25;

// ============================================================
// Notion API helpers
// ============================================================

async function notionFetch(endpoint, method = "GET", body = undefined) {
  const url = `https://api.notion.com/v1${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * 取得時間窗口起始點（N 小時前）
 */
function getSyncWindowStart() {
  const now = new Date();
  now.setHours(now.getHours() - SYNC_WINDOW_HOURS);
  return now.toISOString();
}

/**
 * 方式 A：從指定 Database 查詢（需要 NOTION_DATABASE_ID）
 * - 支援 Category Relation 過濾
 * - 支援 last_edited_time 時間窗口過濾
 */
async function queryDatabase() {
  const sinceTime = getSyncWindowStart();
  console.log(`⏰ 只抓取 ${SYNC_WINDOW_HOURS} 小時內有異動的頁面（自 ${sinceTime}）`);

  // 組合過濾條件
  const filters = [];
  if (BLOG_PAGE_RELATION_ID) {
    filters.push({
      property: "Category",
      relation: { contains: BLOG_PAGE_RELATION_ID },
    });
  }
  filters.push({
    timestamp: "last_edited_time",
    last_edited_time: { on_or_after: sinceTime },
  });

  const filter = filters.length === 1 ? filters[0] : { and: filters };

  let allPages = [];
  let cursor = undefined;

  do {
    const body = {
      filter,
      sorts: [{ property: "last_edited_time", direction: "descending" }],
      ...(cursor && { start_cursor: cursor }),
    };
    const data = await notionFetch(
      `/databases/${NOTION_DATABASE_ID}/query`,
      "POST",
      body
    );
    allPages = allPages.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return allPages;
}

/**
 * 方式 B：用 Search API 搜尋整個 workspace（不需要 NOTION_DATABASE_ID）
 * - 搜尋所有近期修改的 page
 * - 檢查頁面內容是否有 mention 連到 @blog
 */
async function searchRecentPages() {
  const sinceTime = getSyncWindowStart();
  console.log(`⏰ 搜尋 ${SYNC_WINDOW_HOURS} 小時內有異動的頁面（自 ${sinceTime}）`);

  let candidatePages = [];
  let cursor = undefined;

  do {
    const body = {
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      ...(cursor && { start_cursor: cursor }),
      page_size: 100,
    };
    const data = await notionFetch("/search", "POST", body);

    // 只保留時間窗口內的頁面
    for (const page of data.results) {
      if (new Date(page.last_edited_time) >= new Date(sinceTime)) {
        candidatePages.push(page);
      } else {
        // 因為已按時間排序，遇到超出窗口的就可以停了
        cursor = undefined;
        break;
      }
    }

    if (cursor !== undefined) {
      cursor = data.has_more ? data.next_cursor : undefined;
    }
  } while (cursor);

  // 如果有設定 BLOG_PAGE_RELATION_ID，檢查每個頁面是否有 mention 連到 @blog
  if (!BLOG_PAGE_RELATION_ID) return candidatePages;

  console.log(`🔍 檢查 ${candidatePages.length} 個頁面是否有 @blog 連結...`);
  const filteredPages = [];

  for (const page of candidatePages) {
    if (await pageHasBlogLink(page.id)) {
      filteredPages.push(page);
    }
  }

  return filteredPages;
}

/**
 * 檢查頁面內容是否有 mention 連到 BLOG_PAGE_RELATION_ID
 */
async function pageHasBlogLink(pageId) {
  const normalizedTarget = BLOG_PAGE_RELATION_ID.replace(/-/g, "");
  try {
    const data = await notionFetch(`/blocks/${pageId}/children`);
    for (const block of data.results) {
      const richTexts = block[block.type]?.rich_text || [];
      for (const rt of richTexts) {
        if (
          rt.type === "mention" &&
          rt.mention?.type === "page" &&
          rt.mention?.page?.id?.replace(/-/g, "") === normalizedTarget
        ) {
          return true;
        }
      }
    }
  } catch (e) {
    // 無法讀取，跳過
  }
  return false;
}

async function getBlockChildren(blockId) {
  let allBlocks = [];
  let cursor = undefined;

  do {
    const qs = cursor ? `?start_cursor=${cursor}` : "";
    const data = await notionFetch(`/blocks/${blockId}/children${qs}`);
    allBlocks = allBlocks.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return allBlocks;
}

// ============================================================
// Image download (Notion 圖片會過期，必須本地化)
// ============================================================

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : require("node:http");
    protocol
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Follow redirect
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        response.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      })
      .on("error", (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function saveImage(imageUrl, pageSlug) {
  const hash = crypto.createHash("md5").update(imageUrl.split("?")[0]).digest("hex").slice(0, 12);
  const ext = path.extname(new URL(imageUrl).pathname) || ".png";
  const filename = `${pageSlug}-${hash}${ext}`;
  const destDir = path.join(IMAGES_DIR, pageSlug);
  const destPath = path.join(destDir, filename);

  if (fs.existsSync(destPath)) {
    // 已下載，跳過
    return path.relative(POSTS_DIR, destPath).replace(/\\/g, "/");
  }

  fs.mkdirSync(destDir, { recursive: true });
  await downloadFile(imageUrl, destPath);
  console.log(`  📷 下載圖片: ${filename}`);
  return path.relative(POSTS_DIR, destPath).replace(/\\/g, "/");
}

// ============================================================
// Notion Blocks → Markdown
// ============================================================

function richTextToMd(richTexts) {
  return richTexts
    .map((rt) => {
      let text = rt.plain_text;

      // notion.so 超連結 / page mention → 已收集為 tag，內文略過
      if (rt.href && rt.href.includes("notion.so")) return "";
      if (rt.type === "mention" && rt.mention?.type === "page") return "";

      if (rt.annotations.bold) text = `**${text}**`;
      if (rt.annotations.italic) text = `*${text}*`;
      if (rt.annotations.strikethrough) text = `~~${text}~~`;
      if (rt.annotations.code) text = `\`${text}\``;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join("");
}

/**
 * 從 rich_text 陣列中收集 notion.so 連結 / page mention 作為 tag 名稱
 * （排除 blog 本身）
 */
function extractTagsFromRichTexts(richTexts, collectedTags) {
  for (const rt of richTexts) {
    const text = rt.plain_text;
    if (!text || text.toLowerCase() === "blog") continue;
    if (rt.href && rt.href.includes("notion.so")) {
      collectedTags.add(text);
    } else if (rt.type === "mention" && rt.mention?.type === "page") {
      collectedTags.add(text);
    }
  }
}

async function blocksToMarkdown(blocks, pageSlug, indent = "", collectedTags = new Set()) {
  let md = "";

  for (const block of blocks) {
    // 從每個 block 的 rich_text 收集 tag
    const richTexts = block[block.type]?.rich_text || [];
    extractTagsFromRichTexts(richTexts, collectedTags);

    switch (block.type) {
      case "paragraph":
        md += `${indent}${richTextToMd(block.paragraph.rich_text)}\n\n`;
        break;

      case "heading_1":
        md += `# ${richTextToMd(block.heading_1.rich_text)}\n\n`;
        break;

      case "heading_2":
        md += `## ${richTextToMd(block.heading_2.rich_text)}\n\n`;
        break;

      case "heading_3":
        md += `### ${richTextToMd(block.heading_3.rich_text)}\n\n`;
        break;

      case "bulleted_list_item":
        md += `${indent}- ${richTextToMd(block.bulleted_list_item.rich_text)}\n`;
        if (block.has_children) {
          const children = await getBlockChildren(block.id);
          md += await blocksToMarkdown(children, pageSlug, indent + "  ", collectedTags);
        }
        break;

      case "numbered_list_item":
        md += `${indent}1. ${richTextToMd(block.numbered_list_item.rich_text)}\n`;
        if (block.has_children) {
          const children = await getBlockChildren(block.id);
          md += await blocksToMarkdown(children, pageSlug, indent + "  ", collectedTags);
        }
        break;

      case "to_do":
        const checked = block.to_do.checked ? "x" : " ";
        md += `${indent}- [${checked}] ${richTextToMd(block.to_do.rich_text)}\n`;
        break;

      case "toggle":
        md += `<details>\n<summary>${richTextToMd(block.toggle.rich_text)}</summary>\n\n`;
        if (block.has_children) {
          const children = await getBlockChildren(block.id);
          md += await blocksToMarkdown(children, pageSlug, "", collectedTags);
        }
        md += `</details>\n\n`;
        break;

      case "code":
        const lang = block.code.language || "";
        md += `\`\`\`${lang}\n${richTextToMd(block.code.rich_text)}\n\`\`\`\n\n`;
        break;

      case "quote":
        const quoteText = richTextToMd(block.quote.rich_text);
        md += quoteText
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n\n";
        break;

      case "callout":
        const icon = block.callout.icon?.emoji || "💡";
        md += `> ${icon} ${richTextToMd(block.callout.rich_text)}\n\n`;
        break;

      case "divider":
        md += "---\n\n";
        break;

      case "image": {
        const imgUrl =
          block.image.type === "external"
            ? block.image.external.url
            : block.image.file.url;
        const localPath = await saveImage(imgUrl, pageSlug);
        const caption = block.image.caption?.length
          ? richTextToMd(block.image.caption)
          : "image";
        md += `![${caption}](${localPath})\n\n`;
        break;
      }

      case "bookmark":
        md += `[${block.bookmark.url}](${block.bookmark.url})\n\n`;
        break;

      case "table": {
        if (block.has_children) {
          const rows = await getBlockChildren(block.id);
          for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].table_row.cells;
            const row = cells.map((cell) => richTextToMd(cell)).join(" | ");
            md += `| ${row} |\n`;
            if (i === 0) {
              md += `| ${cells.map(() => "---").join(" | ")} |\n`;
            }
          }
          md += "\n";
        }
        break;
      }

      default:
        // 未支援的 block type，略過但記錄
        if (block.type !== "unsupported") {
          console.log(`  ⚠️ 略過不支援的區塊類型: ${block.type}`);
        }
        break;
    }
  }

  return md;
}

// ============================================================
// Sync State 管理
// ============================================================

function loadSyncState() {
  if (fs.existsSync(SYNC_STATE_FILE)) {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, "utf-8"));
  }
  return { lastSyncTime: new Date(0).toISOString(), processedPages: {} };
}

function saveSyncState(state) {
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================
// Property extractors
// ============================================================

function getTitle(properties) {
  // Search API 回傳的普通頁面，key 是小寫 "title"
  const titleProp =
    properties.Name?.title ||
    properties.Title?.title ||
    properties.title?.title ||
    properties["名稱"]?.title ||
    [];
  return titleProp.map((t) => t.plain_text).join("") || "Untitled";
}

function getSlug(properties, pageId) {
  const slugProp =
    properties.Slug?.rich_text ||
    properties.slug?.rich_text ||
    [];
  const slug = slugProp.map((t) => t.plain_text).join("");
  return slug || pageId.replace(/-/g, "");
}

function getDescription(properties) {
  const descProp =
    properties.Description?.rich_text ||
    properties.description?.rich_text ||
    properties["描述"]?.rich_text ||
    [];
  return descProp.map((t) => t.plain_text).join("");
}

function getTags(properties) {
  const tagsProp =
    properties.Tags?.multi_select ||
    properties.tags?.multi_select ||
    properties["標籤"]?.multi_select ||
    [];
  return tagsProp.map((t) => t.name);
}

function getCategory(properties) {
  const catProp =
    properties.Category?.select ||
    properties.category?.select ||
    null;
  return catProp?.name || "";
}

function isPublished(properties) {
  // 支援 checkbox (Published) 或 status (Status)
  if (properties.Published?.checkbox !== undefined) {
    return properties.Published.checkbox;
  }
  if (properties.Public?.checkbox !== undefined) {
    return properties.Public.checkbox;
  }
  if (properties.Status?.status) {
    return properties.Status.status.name === "Published";
  }
  return true; // 預設發佈
}

// ============================================================
// Main sync
// ============================================================

async function main() {
  if (!NOTION_TOKEN) {
    console.error("❌ 缺少環境變數：NOTION_TOKEN 為必填");
    process.exit(1);
  }

  console.log("🔄 開始 Notion → Fuwari 同步...");

  // 自動選擇抓取方式
  let pages;
  if (NOTION_DATABASE_ID) {
    console.log("📡 模式 A：從指定 Database 查詢");
    pages = await queryDatabase();
  } else {
    console.log("📡 模式 B：用 Search API 搜尋 workspace（未設定 DATABASE_ID）");
    pages = await searchRecentPages();
  }
  console.log(`📋 找到 ${pages.length} 筆近 ${SYNC_WINDOW_HOURS} 小時內有異動的文章`);

  const state = loadSyncState();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const page of pages) {
    const pageId = page.id;
    const props = page.properties;

    // 過濾未發佈
    if (!isPublished(props)) {
      skipped++;
      continue;
    }

    // 增量更新：檢查是否有變動
    const lastEdited = page.last_edited_time;
    const lastSynced = state.processedPages[pageId];
    if (lastSynced && new Date(lastEdited) <= new Date(lastSynced)) {
      skipped++;
      continue;
    }

    const title = getTitle(props);
    const slug = getSlug(props, pageId);
    const description = getDescription(props);
    const propTags = getTags(props);
    const category = getCategory(props);
    const publishedDate = new Date(page.created_time);
    const updatedDate = new Date(page.last_edited_time);

    console.log(`\n📝 處理: ${title} (${slug})`);

    // 取得文章內容，同時收集內文中的 notion.so 連結 / mention tag
    const blocks = await getBlockChildren(pageId);
    const contentTags = new Set();
    const content = await blocksToMarkdown(blocks, slug, "", contentTags);

    // 合併 property tags 與內文收集的 tags（去重）
    const tags = [...new Set([...propTags, ...contentTags])];

    // 組合 Fuwari 格式的 Front Matter
    const frontMatter = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `published: ${publishedDate.toISOString().split("T")[0]}`,
      `updated: ${updatedDate.toISOString().split("T")[0]}`,
      `description: "${description.replace(/"/g, '\\"')}"`,
      tags.length > 0
        ? `tags:\n${tags.map((t) => `  - "${t}"`).join("\n")}`
        : "tags: []",
      category ? `category: "${category}"` : 'category: ""',
      `# notionPageId: "${pageId}"`,
      "---",
      "",
    ].join("\n");

    // 寫入中文檔案
    const filePath = path.join(POSTS_DIR, `${slug}.md`);
    const isNew = !fs.existsSync(filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, frontMatter + content);

    if (isNew) {
      created++;
      console.log(`  ✅ 新增: ${slug}.md`);
    } else {
      updated++;
      console.log(`  🔄 更新: ${slug}.md`);
    }

    state.processedPages[pageId] = new Date().toISOString();
  }

  state.lastSyncTime = new Date().toISOString();
  saveSyncState(state);

  console.log("\n" + "=".repeat(50));
  console.log(`🎉 同步完成！`);
  console.log(`   新增: ${created} 篇`);
  console.log(`   更新: ${updated} 篇`);
  console.log(`   略過: ${skipped} 篇`);
  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error("❌ 同步失敗:", err);
  process.exit(1);
});
