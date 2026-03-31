/**
 * Notion → Fuwari Blog 同步腳本
 *
 * 從 Notion Database 抓取已發佈文章，轉換為 Fuwari 格式的 Markdown，
 * 存入 src/content/posts/ 目錄。
 *
 * 環境變數：
 *   NOTION_TOKEN          - Notion Integration Token
 *   NOTION_DATABASE_ID    - Notion Database ID
 *   BLOG_PAGE_RELATION_ID - BLOG 關聯頁面 ID (可選，若有 Category Relation 過濾)
 *   BLOG_AUTHOR           - 作者名稱 (可選)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(PROJECT_ROOT, "src", "content", "posts");
const IMAGES_DIR = path.join(PROJECT_ROOT, "src", "assets", "notion-images");
const SYNC_STATE_FILE = path.join(PROJECT_ROOT, ".sync-state.json");

const NOTION_API_VERSION = "2022-06-28";
const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || "";
const BLOG_PAGE_RELATION_ID = process.env.BLOG_PAGE_RELATION_ID || "";

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

async function queryDatabase() {
  const filter = BLOG_PAGE_RELATION_ID
    ? {
        property: "Category",
        relation: { contains: BLOG_PAGE_RELATION_ID },
      }
    : undefined;

  let allPages = [];
  let cursor = undefined;

  do {
    const body = {
      ...(filter && { filter }),
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
      if (rt.annotations.bold) text = `**${text}**`;
      if (rt.annotations.italic) text = `*${text}*`;
      if (rt.annotations.strikethrough) text = `~~${text}~~`;
      if (rt.annotations.code) text = `\`${text}\``;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join("");
}

async function blocksToMarkdown(blocks, pageSlug, indent = "") {
  let md = "";

  for (const block of blocks) {
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
          md += await blocksToMarkdown(children, pageSlug, indent + "  ");
        }
        break;

      case "numbered_list_item":
        md += `${indent}1. ${richTextToMd(block.numbered_list_item.rich_text)}\n`;
        if (block.has_children) {
          const children = await getBlockChildren(block.id);
          md += await blocksToMarkdown(children, pageSlug, indent + "  ");
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
          md += await blocksToMarkdown(children, pageSlug);
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
  const titleProp =
    properties.Name?.title ||
    properties.Title?.title ||
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
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
    console.error("❌ 缺少環境變數：NOTION_TOKEN 與 NOTION_DATABASE_ID 為必填");
    process.exit(1);
  }

  console.log("🔄 開始 Notion → Fuwari 同步...");
  const state = loadSyncState();
  const pages = await queryDatabase();
  console.log(`📋 Notion 資料庫共 ${pages.length} 筆文章`);

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
    const tags = getTags(props);
    const category = getCategory(props);
    const publishedDate = new Date(page.created_time);
    const updatedDate = new Date(page.last_edited_time);

    console.log(`\n📝 處理: ${title} (${slug})`);

    // 取得文章內容
    const blocks = await getBlockChildren(pageId);
    const content = await blocksToMarkdown(blocks, slug);

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

    // 寫入檔案
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
