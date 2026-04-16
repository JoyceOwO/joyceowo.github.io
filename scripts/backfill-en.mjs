/**
 * 英文版一次性補齊腳本
 *
 * 掃描 src/content/posts/ 下所有中文 .md，
 * 找出在 src/content/posts/en/ 沒有對應英文版的，
 * 呼叫 Gemini API 翻譯後寫入。
 *
 * 用法：
 *   $env:GEMINI_API_KEY = "AIzaSy..."
 *   node scripts/backfill-en.mjs
 *
 * 選項（環境變數）：
 *   GEMINI_API_KEY   - Google Gemini API Key（必填）
 *   BATCH_SIZE       - 每批翻譯篇數，每批之間暫停避免 Rate Limit（預設 5）
 *   BATCH_DELAY_MS   - 每批之間的等待毫秒（預設 4000）
 *   DRY_RUN          - 設為 "1" 時只列出待翻譯清單，不實際翻譯
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(PROJECT_ROOT, "src", "content", "posts");
const POSTS_EN_DIR = path.join(PROJECT_ROOT, "src", "content", "posts", "en");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 5;
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS) || 4000;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!GEMINI_API_KEY) {
  console.error("❌ 請設定環境變數：");
  console.error('   $env:GEMINI_API_KEY = "AIzaSy..."');
  process.exit(1);
}

// ============================================================
// 解析 Markdown frontmatter
// ============================================================

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content: raw };

  const yamlBlock = match[1];
  const content = match[2];

  // 簡易 YAML 解析（只抓 key: "value" 或 key: value）
  const frontmatter = {};
  for (const line of yamlBlock.split("\n")) {
    const m = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (m) frontmatter[m[1]] = m[2];
  }

  return { frontmatter, content };
}

function buildFrontmatterBlock(original, enTitle, enDescription) {
  // 逐行替換 title 和 description，保留其餘欄位
  const lines = original.split("\n");
  return lines
    .map((line) => {
      if (/^title:/.test(line))
        return `title: "${enTitle.replace(/"/g, '\\"')}"`;
      if (/^description:/.test(line))
        return `description: "${enDescription.replace(/"/g, '\\"')}"`;
      if (/^lang:/.test(line)) return `lang: "en"`;
      return line;
    })
    .join("\n");
}

function normalizeImagePathForEn(imagePath) {
  if (imagePath.startsWith("../../assets/")) {
    return imagePath.replace("../../assets/", "../../../assets/");
  }
  return imagePath;
}

function protectImageMarkdown(markdown) {
  const tokens = [];
  let index = 0;

  const protectedContent = markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
    (_match, altText, imagePath, titlePart = "") => {
      const token = `__IMG_TOKEN_${index++}__`;
      const normalizedPath = normalizeImagePathForEn(imagePath);
      const restored = `![${altText}](${normalizedPath}${titlePart})`;
      tokens.push({ token, restored });
      return token;
    },
  );

  return { protectedContent, tokens };
}

function restoreImageTokens(markdown, tokens) {
  let restored = markdown;
  for (const { token, restored: imageMarkdown } of tokens) {
    restored = restored.split(token).join(imageMarkdown);
  }
  return restored;
}

function validateImagePathsInContent(content, targetFilePath) {
  const missingPaths = [];
  const imageRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    const imagePath = match[1];
    if (/^(https?:)?\/\//.test(imagePath)) continue;

    const absolute = path.resolve(path.dirname(targetFilePath), imagePath);
    if (!fs.existsSync(absolute)) {
      missingPaths.push(imagePath);
    }
  }

  return [...new Set(missingPaths)];
}

// ============================================================
// Gemini 翻譯
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
8. Content may include placeholders like __IMG_TOKEN_0__. Keep EVERY placeholder string EXACTLY unchanged.

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
    throw new Error(`Gemini response is not valid JSON: ${raw.slice(0, 300)}`);
  }

  return {
    title: parsed.title || title,
    description: parsed.description || description || "",
    content: parsed.content || markdownContent,
  };
}

// ============================================================
// 掃描缺少英文版的文章
// ============================================================

function findMissingOrOutdatedEnPosts() {
  // 中文 posts：POSTS_DIR 下第一層 .md（不含 en/ 子目錄）
  const zhFiles = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, ""), file: f }));

  const result = [];

  for (const { slug, file } of zhFiles) {
    const zhPath = path.join(POSTS_DIR, file);
    const enPath = path.join(POSTS_EN_DIR, file);

    if (!fs.existsSync(enPath)) {
      result.push({ slug, file, reason: "missing" });
    } else {
      const zhMtime = fs.statSync(zhPath).mtimeMs;
      const enMtime = fs.statSync(enPath).mtimeMs;
      if (zhMtime > enMtime) {
        result.push({ slug, file, reason: "outdated" });
      }
    }
  }

  return result;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log("🌐 英文版補齊腳本");
  console.log("=".repeat(60));

  const missing = findMissingOrOutdatedEnPosts();

  if (missing.length === 0) {
    console.log("✅ 所有文章都已有英文版且為最新，無需補齊。");
    return;
  }

  const missingCount = missing.filter((p) => p.reason === "missing").length;
  const outdatedCount = missing.filter((p) => p.reason === "outdated").length;
  console.log(`📋 找到 ${missing.length} 篇需要處理（缺少: ${missingCount}，過期: ${outdatedCount}）：`);
  for (const { slug, reason } of missing) {
    console.log(`   - ${slug}  [${reason === "missing" ? "缺少英文版" : "中文已更新"}]`);
  }

  if (DRY_RUN) {
    console.log("\n🔍 DRY_RUN=1，只列出清單，不執行翻譯。");
    return;
  }

  console.log(
    `\n⚙️  每批 ${BATCH_SIZE} 篇，批次間等待 ${BATCH_DELAY_MS}ms\n`,
  );

  fs.mkdirSync(POSTS_EN_DIR, { recursive: true });

  let succeeded = 0;
  let failed = 0;
  const failedSlugs = [];

  for (let i = 0; i < missing.length; i++) {
    const { slug, file, reason } = missing[i];
    const zhPath = path.join(POSTS_DIR, file);
    const enPath = path.join(POSTS_EN_DIR, file);

    // 暫停：每批 BATCH_SIZE 篇後等待
    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(
        `\n⏳ 已處理 ${i}/${missing.length} 篇，等待 ${BATCH_DELAY_MS}ms 避免 Rate Limit...`,
      );
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    // 統一換行符（Windows CRLF → LF），確保 regex 可正確比對
    const raw = fs.readFileSync(zhPath, "utf-8").replace(/\r\n/g, "\n");
    const fmMatch = raw.match(/^(---\n[\s\S]*?\n---\n?)(\n?[\s\S]*)$/);
    if (!fmMatch) {
      console.warn(`  ⚠️  [${i + 1}/${missing.length}] 無法解析 frontmatter: ${file}`);
      failed++;
      failedSlugs.push(slug);
      continue;
    }

    const originalFm = fmMatch[1];
    const mdContent = fmMatch[2];
    const { frontmatter } = parseFrontmatter(raw);

    const title = frontmatter.title || slug;
    const description = frontmatter.description || "";

    // 跳過已是英文的文章（lang: en）
    if (frontmatter.lang === "en") {
      console.log(
        `  ⏭️  [${i + 1}/${missing.length}] 略過（已是英文）: ${slug}`,
      );
      continue;
    }

    process.stdout.write(
      `  🌐 [${i + 1}/${missing.length}] ${reason === "outdated" ? "重翻" : "翻譯"}: ${slug} ...`,
    );

    try {
      const { protectedContent, tokens: imageTokens } =
        protectImageMarkdown(mdContent);

      const { title: enTitle, description: enDescription, content: enContentRaw } =
        await geminiTranslate(title, description, protectedContent);

      const missingTokens = imageTokens.filter(
        ({ token }) => !enContentRaw.includes(token),
      );
      if (missingTokens.length > 0) {
        throw new Error(
          `Translation dropped ${missingTokens.length} image token(s); aborting to prevent broken image paths.`,
        );
      }

      // 還原翻譯前保護的圖片標記，確保檔名與路徑不被模型改寫
      const enContent = restoreImageTokens(enContentRaw, imageTokens);

      // 重組 frontmatter（替換 title / description / lang）
      let enFm = originalFm;
      enFm = enFm.replace(
        /^title:.*$/m,
        `title: "${enTitle.replace(/"/g, '\\"')}"`,
      );
      enFm = enFm.replace(
        /^description:.*$/m,
        `description: "${enDescription.replace(/"/g, '\\"')}"`,
      );
      if (/^lang:/m.test(enFm)) {
        enFm = enFm.replace(/^lang:.*$/m, `lang: "en"`);
      } else {
        // 在結尾 --- 前插入 lang（用字串結尾錨點，避免匹配到開頭的 ---）
        enFm = enFm.replace(/\n---\n?$/, `\nlang: "en"\n---\n`);
      }

      fs.writeFileSync(enPath, enFm + enContent, "utf-8");

      const missingImagePaths = validateImagePathsInContent(enContent, enPath);
      if (missingImagePaths.length > 0) {
        console.log(
          ` ⚠️  發現 ${missingImagePaths.length} 個不存在的圖片路徑：${missingImagePaths.join(", ")}`,
        );
      }

      console.log(" ✅");
      succeeded++;
    } catch (err) {
      console.log(` ❌ ${err.message}`);
      failed++;
      failedSlugs.push(slug);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`🎉 補齊完成！`);
  console.log(`   成功: ${succeeded} 篇`);
  console.log(`   失敗: ${failed} 篇`);
  if (failedSlugs.length > 0) {
    console.log(`\n失敗清單（可重新執行腳本自動補齊）：`);
    for (const s of failedSlugs) console.log(`   - ${s}`);
  }
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 執行失敗:", err);
  process.exit(1);
});
