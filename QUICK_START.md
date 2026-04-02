# 🚀 快速開始指南

## 即時開發

```powershell
# 1. 啟動開發伺服器
npm run dev

# 2. 開啟瀏覽器訪問
# http://localhost:3000
```

## 編輯現有文章

編輯 `src/content/posts/` 中的任何 `.md` 檔案，伺服器會自動熱更新。

## 建立新文章

在 `src/content/posts/` 新建 `your-article.md`：

```markdown
---
title: '我的第一篇文章'
description: '這是文章描述'
pubDate: 2024-01-15
author: '你的名字'
image: '/images/article-cover.jpg'
tags:
  - astro
  - blog
---

# 文章標題

文章內容寫在這裡...
```

## 構建與部署

```powershell
# 生成靜態網站
npm run build

# 預覽構建結果
npm run preview

# 上傳至 GitHub（假設已設定 origin）
git add .
git commit -m "Add new posts"
git push origin main
```

## 修改網站設定

編輯 `astro.config.mjs`：

```javascript
// 若部署至自訂倉庫（如 yourusername.github.io/GithubBlog）
export default defineConfig({
  site: 'https://yourusername.github.io',
  base: '/GithubBlog',
  // ... 其他設定
});
```

## 使用 Notion 同步（後續設定）

1. 取得 Notion Integration Token
2. 設定 GitHub Secrets：
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
   - `BLOG_PAGE_RELATION_ID`
3. 執行同步指令碼：
   ```powershell
   npm run sync-notion
   ```

## 常用命令

| 命令 | 說明 |
|------|------|
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 構建生產版本 |
| `npm run preview` | 預覽構建結果 |
| `npm run lint` | 檢查程式碼 |
| `npm run format` | 格式化程式碼 |
| `npm run sync-notion` | 同步 Notion 資料 |

## 更多資源

- [Astro 文檔](https://docs.astro.build)
- [Fuwari 倉庫](https://github.com/saicaca/fuwari)
- [Tailwind CSS](https://tailwindcss.com)

---

**需要幫助？** 查看 [BUILD_RECORD.md](BUILD_RECORD.md) 獲取詳細資訊。
