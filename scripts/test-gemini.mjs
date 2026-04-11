/**
 * Gemini 翻譯功能測試腳本（只讀，不寫入任何檔案）
 *
 * 用法：
 *   $env:GEMINI_API_KEY = "AIzaSy..."
 *   node scripts/test-gemini.mjs
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

if (!GEMINI_API_KEY) {
  console.error("❌ 請設定環境變數：");
  console.error('   $env:GEMINI_API_KEY = "AIzaSy..."');
  process.exit(1);
}

// ============================================================
// 測試用假文章（模擬 Notion 同步後的典型格式）
// ============================================================
const TEST_TITLE = "別再手動給權限了！用這套 SQL 角色設計讓管理變簡單";
const TEST_DESCRIPTION = "";
const TEST_CONTENT = `
## 結論

- 用「自訂角色 + 內建角色」組合管理 SQL Server 權限，比直接對使用者 \`GRANT\` 更穩，也更容易維護。

## 適合用在哪裡

- 資料庫使用者越來越多，權限開始失控
- 新人、廠商、支援人員需要不同層級的 DB 權限

## 流程步驟

### 1. 先把角色模型定下來

先定義三種標準角色：唯讀、一般開發、可改 Schema 的進階開發。

\`\`\`sql
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'role_db_readonly')
    CREATE ROLE role_db_readonly;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'role_db_developer')
    CREATE ROLE role_db_developer;
GO
\`\`\`

### 2. 用內建角色拼出權限模板

把 \`db_datareader\` 加給唯讀角色：

\`\`\`sql
ALTER ROLE db_datareader ADD MEMBER role_db_readonly;
\`\`\`

詳細設定請參考 [Microsoft 文件](https://docs.microsoft.com/sql/relational-databases/security/authentication-access/database-level-roles)

![設定截圖](../../assets/notion-images/example/example-abc123.png)
`.trim();

// ============================================================
// Gemini 翻譯函式（與 sync-notion.mjs 相同邏輯）
// ============================================================
async function geminiTranslate(title, description, markdownContent) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `You are a professional technical blog translator.

Translate the following Chinese technical blog post into natural, fluent English for software developers.

STRICT RULES:
1. Keep ALL fenced code blocks (lines between \`\`\` markers) EXACTLY as-is — do NOT translate or modify any code.
2. Keep ALL image Markdown references EXACTLY as-is (e.g. ![image](../../assets/...)).
3. Keep ALL hyperlinks EXACTLY as-is.
4. Preserve ALL Markdown formatting (##, ###, -, 1., **, *, \`, etc.).
5. Translate technical terms accurately; keep well-known identifiers unchanged (SQL, GitHub, NuGet, etc.).
6. Return ONLY a valid JSON object with exactly three string keys: "title", "description", "content".
7. Do NOT wrap the JSON in markdown fences or add any extra text.

Input:
title: ${title}
description: ${(description || "").trim() || title}
content:
${markdownContent}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini response is not valid JSON:\n${raw.slice(0, 500)}`);
  }

  return {
    title: parsed.title || title,
    description: parsed.description || description || "",
    content: parsed.content || markdownContent,
  };
}

// ============================================================
// 驗證函式
// ============================================================
function verifyCodeBlocksPreserved(original, translated) {
  const codeBlockRe = /```[\s\S]*?```/g;
  const origBlocks = original.match(codeBlockRe) || [];
  const transBlocks = translated.match(codeBlockRe) || [];

  if (origBlocks.length !== transBlocks.length) {
    return `❌ code block 數量不同 (原始: ${origBlocks.length}, 翻譯後: ${transBlocks.length})`;
  }
  for (let i = 0; i < origBlocks.length; i++) {
    if (origBlocks[i] !== transBlocks[i]) {
      return `❌ code block [${i}] 內容被修改:\n原始: ${origBlocks[i]}\n翻譯後: ${transBlocks[i]}`;
    }
  }
  return `✅ 所有 ${origBlocks.length} 個 code block 保持原樣`;
}

function verifyImagePathsPreserved(original, translated) {
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const origImgs = [...original.matchAll(imgRe)].map((m) => m[2]);
  const transImgs = [...translated.matchAll(imgRe)].map((m) => m[2]);

  if (origImgs.length !== transImgs.length) {
    return `❌ 圖片數量不同 (原始: ${origImgs.length}, 翻譯後: ${transImgs.length})`;
  }
  for (let i = 0; i < origImgs.length; i++) {
    if (origImgs[i] !== transImgs[i]) {
      return `❌ 圖片路徑被修改:\n原始: ${origImgs[i]}\n翻譯後: ${transImgs[i]}`;
    }
  }
  return `✅ 所有 ${origImgs.length} 個圖片路徑保持原樣`;
}

function verifyLinksPreserved(original, translated) {
  const linkRe = /\[([^\]]+)\]\((https?[^)]+)\)/g;
  const origLinks = [...original.matchAll(linkRe)].map((m) => m[2]);
  const transLinks = [...translated.matchAll(linkRe)].map((m) => m[2]);

  if (origLinks.length !== transLinks.length) {
    return `❌ 連結數量不同 (原始: ${origLinks.length}, 翻譯後: ${transLinks.length})`;
  }
  for (let i = 0; i < origLinks.length; i++) {
    if (origLinks[i] !== transLinks[i]) {
      return `❌ 連結被修改:\n原始: ${origLinks[i]}\n翻譯後: ${transLinks[i]}`;
    }
  }
  return `✅ 所有 ${origLinks.length} 個超連結保持原樣`;
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("=".repeat(60));
  console.log("🧪 Gemini 翻譯測試");
  console.log("=".repeat(60));
  console.log(`📝 測試文章: ${TEST_TITLE}`);
  console.log(`🔑 API Key: ${GEMINI_API_KEY.slice(0, 8)}...`);
  console.log();

  try {
    console.log("⏳ 呼叫 Gemini API ...");
    const start = Date.now();
    const result = await geminiTranslate(TEST_TITLE, TEST_DESCRIPTION, TEST_CONTENT);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`✅ API 回應成功 (${elapsed}s)`);
    console.log();

    // 驗證
    console.log("─".repeat(60));
    console.log("🔍 驗證結果");
    console.log("─".repeat(60));
    console.log(verifyCodeBlocksPreserved(TEST_CONTENT, result.content));
    console.log(verifyImagePathsPreserved(TEST_CONTENT, result.content));
    console.log(verifyLinksPreserved(TEST_CONTENT, result.content));
    console.log();

    // 輸出翻譯結果
    console.log("─".repeat(60));
    console.log("📄 翻譯結果預覽");
    console.log("─".repeat(60));
    console.log(`title:       ${result.title}`);
    console.log(`description: ${result.description}`);
    console.log();
    console.log("--- content ---");
    console.log(result.content);
  } catch (err) {
    console.error(`\n❌ 測試失敗: ${err.message}`);
    process.exit(1);
  }
}

main();
