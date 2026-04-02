/**
 * Notion Search API 測試腳本（只讀，不寫入任何檔案）
 * 不需要 DATABASE_ID，用 Search API 搜尋近期有異動的頁面
 *
 * 用法：
 *   $env:NOTION_TOKEN = "secret_xxx"
 *   node scripts/test-notion.mjs
 *
 *   # 可選：指定時間窗口（小時），預設 25
 *   $env:SYNC_WINDOW_HOURS = "48"
 *
 *   # 可選：指定 blog 頁面 ID 來過濾 Relation
 *   $env:BLOG_PAGE_RELATION_ID = "xxx"
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const BLOG_PAGE_RELATION_ID = process.env.BLOG_PAGE_RELATION_ID || "";
const SYNC_WINDOW_HOURS = Number(process.env.SYNC_WINDOW_HOURS) || 25;

if (!NOTION_TOKEN) {
  console.error("❌ 請設定環境變數：");
  console.error('   $env:NOTION_TOKEN = "secret_xxx"');
  process.exit(1);
}

async function notionFetch(endpoint, method = "GET", body = undefined) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
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

async function main() {
  const sinceTime = new Date();
  sinceTime.setHours(sinceTime.getHours() - SYNC_WINDOW_HOURS);

  // ============================================================
  // Step 1: 測試連線
  // ============================================================
  console.log("=".repeat(60));
  console.log("📡 Step 1: 測試 Notion API 連線...");
  console.log("=".repeat(60));

  try {
    const test = await notionFetch("/search", "POST", { page_size: 1 });
    console.log(`✅ 連線成功！`);
  } catch (err) {
    console.error(`❌ 連線失敗: ${err.message}`);
    console.error("\n💡 可能原因：");
    console.error("   1. NOTION_TOKEN 不正確");
    console.error("   2. Integration 尚未被加入到任何頁面的 Connections");
    process.exit(1);
  }

  // ============================================================
  // Step 2: 搜尋近期有異動的頁面
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log(`📡 Step 2: 搜尋近 ${SYNC_WINDOW_HOURS} 小時內有異動的頁面...`);
  console.log(`   起始時間: ${sinceTime.toISOString()}`);
  if (BLOG_PAGE_RELATION_ID) {
    console.log(`   過濾: 只看有 @blog Relation 的頁面`);
  }
  console.log("=".repeat(60));

  let allPages = [];

  try {
    let cursor = null;
    let reachedOld = false;

    do {
      const body = {
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        ...(cursor && { start_cursor: cursor }),
        page_size: 100,
      };
      const data = await notionFetch("/search", "POST", body);
      console.log(`   API 回傳 ${data.results.length} 筆, has_more=${data.has_more}`);

      // 診斷：顯示前 3 筆的時間
      for (let j = 0; j < Math.min(data.results.length, 3); j++) {
        const p = data.results[j];
        const title = Object.values(p.properties || {}).find(v => v.type === "title")?.title?.map(t => t.plain_text).join("") || "(無標題)";
        console.log(`     [${j}] ${title} | last_edited: ${p.last_edited_time} | sinceTime: ${sinceTime.toISOString()} | 符合: ${new Date(p.last_edited_time) >= sinceTime}`);
      }

      for (const page of data.results) {
        if (new Date(page.last_edited_time) >= sinceTime) {
          allPages.push(page);
        } else {
          reachedOld = true;
          break;
        }
      }

      cursor = (!reachedOld && data.has_more) ? data.next_cursor : null;
    } while (cursor);

    console.log(`\n✅ 找到 ${allPages.length} 個近期有異動的頁面`);

    // ============================================================
    // Step 3: 列出每個頁面
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("📝 Step 3: 頁面詳細列表");
    console.log("=".repeat(60));

    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      const props = page.properties || {};

      // 取得標題
      let title = "(無標題)";
      for (const [key, val] of Object.entries(props)) {
        if (val.type === "title" && val.title?.length > 0) {
          title = val.title.map((t) => t.plain_text).join("");
          break;
        }
      }

      // 取得頁面區塊，檢查是否有 mention 連到 @blog
      let hasBlogLink = "—";
      const foundMentionIds = [];
      if (BLOG_PAGE_RELATION_ID) {
        const normalizedTarget = BLOG_PAGE_RELATION_ID.replace(/-/g, "");
        try {
          const blocks = await notionFetch(`/blocks/${page.id}/children`);
          for (const block of blocks.results) {
            const richTexts = block[block.type]?.rich_text || [];
            for (const rt of richTexts) {
              if (rt.type === "mention" && rt.mention?.type === "page" && rt.mention?.page?.id) {
                const mentionId = rt.mention.page.id.replace(/-/g, "");
                foundMentionIds.push(rt.mention.page.id);
                if (mentionId === normalizedTarget) {
                  hasBlogLink = "✅ 是 (mention 連結)";
                }
              }
            }
          }
          if (hasBlogLink === "—") hasBlogLink = "❌ 否";
        } catch (e) {
          hasBlogLink = `⚠️ 無法讀取區塊: ${e.message}`;
        }
      }

      // 列出所有屬性
      const propList = Object.entries(props).map(([k, v]) => `${k}(${v.type})`).join(", ");

      console.log(`\n  ┌─ 頁面 #${i + 1} ─────────────────────────`);
      console.log(`  │ 標題:       ${title}`);
      console.log(`  │ Page ID:    ${page.id}`);
      console.log(`  │ 最後編輯:   ${page.last_edited_time}`);
      console.log(`  │ URL:        ${page.url}`);
      if (BLOG_PAGE_RELATION_ID) {
        console.log(`  │ @blog:      ${hasBlogLink}`);
        if (foundMentionIds.length > 0) {
          console.log(`  │ mention IDs: ${foundMentionIds.join(", ")}`);
        }
      }
      console.log(`  │ 屬性:       ${propList || "(無屬性 — 普通頁面)"}`);
      console.log(`  │ 父級:       ${page.parent?.type || "?"} → ${page.parent?.page_id || page.parent?.database_id || page.parent?.workspace || "?"}`);
      console.log(`  └──────────────────────────────────`);
    }

    // ============================================================
    // Step 4: 測試第一篇頁面的區塊內容
    // ============================================================
    if (allPages.length > 0) {
      const firstPage = allPages[0];
      let firstTitle = "(無標題)";
      for (const [key, val] of Object.entries(firstPage.properties || {})) {
        if (val.type === "title" && val.title?.length > 0) {
          firstTitle = val.title.map((t) => t.plain_text).join("");
          break;
        }
      }

      console.log("\n" + "=".repeat(60));
      console.log(`📖 Step 4: 測試抓取內容`);
      console.log(`   頁面: ${firstTitle}`);
      console.log("=".repeat(60));

      const blocks = await notionFetch(`/blocks/${firstPage.id}/children`);
      console.log(`\n✅ 共 ${blocks.results.length} 個區塊`);

      for (let i = 0; i < Math.min(blocks.results.length, 15); i++) {
        const block = blocks.results[i];
        let preview = "";

        switch (block.type) {
          case "paragraph":
            preview = block.paragraph.rich_text.map((t) => t.plain_text).join("").slice(0, 80);
            break;
          case "heading_1":
          case "heading_2":
          case "heading_3":
            preview = block[block.type].rich_text.map((t) => t.plain_text).join("");
            break;
          case "code":
            preview = `[${block.code.language}] ${block.code.rich_text.map((t) => t.plain_text).join("").slice(0, 50)}...`;
            break;
          case "image":
            preview = block.image.type === "external" ? block.image.external.url : "(Notion 內部圖片)";
            break;
          case "bulleted_list_item":
            preview = block.bulleted_list_item.rich_text.map((t) => t.plain_text).join("").slice(0, 80);
            break;
          case "callout":
            preview = `${block.callout.icon?.emoji || ""} ${block.callout.rich_text?.map((t) => t.plain_text).join("").slice(0, 60) || ""}`;
            break;
          case "child_page":
            preview = `子頁面: ${block.child_page.title}`;
            break;
          case "child_database":
            preview = `子資料庫: ${block.child_database.title}`;
            break;
          default:
            preview = "(略)";
        }

        console.log(`   [${block.type.padEnd(22)}] ${preview}`);
      }

      if (blocks.results.length > 15) {
        console.log(`   ... 還有 ${blocks.results.length - 15} 個區塊`);
      }
    }

    // ============================================================
    // 摘要
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("📊 摘要");
    console.log("=".repeat(60));
    console.log(`   時間窗口:     近 ${SYNC_WINDOW_HOURS} 小時`);
    console.log(`   找到頁面數:   ${allPages.length}`);

    if (BLOG_PAGE_RELATION_ID) {
      let blogCount = 0;
      for (const page of allPages) {
        try {
          const blocks = await notionFetch(`/blocks/${page.id}/children`);
          const normalizedTarget = BLOG_PAGE_RELATION_ID.replace(/-/g, "");
          for (const block of blocks.results) {
            const richTexts = block[block.type]?.rich_text || [];
            if (richTexts.some((rt) =>
              rt.type === "mention" &&
              rt.mention?.type === "page" &&
              rt.mention?.page?.id?.replace(/-/g, "") === normalizedTarget
            )) {
              blogCount++;
              break;
            }
          }
        } catch (e) { /* skip */ }
      }
      console.log(`   有 @blog 的:  ${blogCount} 篇`);
    }

    const parentTypes = {};
    for (const page of allPages) {
      const type = page.parent?.type || "unknown";
      parentTypes[type] = (parentTypes[type] || 0) + 1;
    }
    console.log(`   父級分佈:    ${Object.entries(parentTypes).map(([k, v]) => `${k}=${v}`).join(", ")}`);

    console.log("\n🎉 測試完成！");
    console.log("\n💡 確認無誤後，可以執行正式同步：");
    console.log("   node scripts/sync-notion.mjs");

  } catch (err) {
    console.error(`\n❌ 搜尋失敗: ${err.message}`);
  }
}

main();
