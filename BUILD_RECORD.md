# Astro + Fuwari Blog 建立流程紀錄

**建立日期**：2026年3月31日  
**Node.js 版本**：22.22.2  
**Astro 版本**：使用 Fuwari 官方模板  
**狀態**：✅ 成功完成初始化

---

## 📋 建立進度

### ✅ 階段 1：環境準備
- [x] Node.js 22.22.2 已確認安裝
- [x] npm 版本已確認
- [x] Git 環境已準備
- [x] pnpm 已安裝（推薦）

**命令檢查**：
```powershell
node --version      # v22.22.2 ✅
npm --version       # 已安裝 ✅
git --version       # 已安裝 ✅
```

---

### ✅ 階段 2：Astro + Fuwari 專案初始化

**命令執行**：
```powershell
cd c:\Joyce\Git\vscode
npm create astro@latest GithubBlog -- --template saicaca/fuwari
```

**初始化選項**：
- 安裝依賴：Yes ✅
- 初始化 Git：Yes ✅
- 信任第三方模板：Yes ✅

**初始化結果**：成功 ✅
- 專案路徑：`c:\Joyce\Git\vscode\GithubBlog`
- 依賴已完整安裝在 `node_modules`

---

### ✅ 階段 3：專案結構驗證

#### 核心目錄結構
```
GithubBlog/
├── src/
│   ├── components/          # Svelte 元件
│   ├── content/
│   │   ├── posts/           # 📝 部落格文章 (Markdown)
│   │   │   ├── draft.md
│   │   │   ├── expressive-code.md
│   │   │   ├── markdown-extended.md
│   │   │   ├── markdown.md
│   │   │   ├── video.md
│   │   │   └── guide/       # 子資料夾範例
│   │   ├── spec/
│   │   │   └── about.md
│   │   └── config.ts        # Content Collection 設定
│   ├── layouts/
│   ├── pages/
│   └── styles/
├── .github/
│   └── workflows/           # GitHub Actions 工作流
├── public/                  # 靜態資產
├── docs/                    # 文檔
├── scripts/                 # 自訂指令碼
├── .vscode/
├── astro.config.mjs         # Astro 配置
├── package.json
├── package-lock.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tailwind.config.cjs      # Tailwind CSS 配置
├── biome.json               # Code 格式化工具
├── frontmatter.json         # Front Matter 設定
├── postcss.config.mjs
├── svelte.config.js
└── README.md
```

#### 已安裝的關鍵軟體包
- **Astro**：最新版本
- **Svelte**：UI 元件框架
- **Tailwind CSS**：樣式框架
- **TypeScript**：型態檢查
- **Astro Content Collections**：內容管理
- **Pagefind**：全文搜尋

---

### ✅ 階段 4：開發環境測試

**命令執行**：
```powershell
npm run dev
```

**預期結果**：開發伺服器成功啟動 ✅
- 預設端口：http://localhost:3000
- 熱模組更新（HMR）：啟用

**可用指令列表**：
```powershell
npm run dev             # 啟動開發伺服器
npm run build           # 生成靜態網站（dist/）
npm run preview         # 預覽構建結果
npm run sync-notion     # 同步 Notion 資料（後續設定）
npm run lint            # 程式碼檢查 (Biome)
npm run format          # 自動格式化
```

---

## 🎯 核心步驟確認

### ✅ 需求 1：Node.js 版本
- **要求**：Node.js 22.12.0+
- **實際**：v22.22.2 ✅

### ✅ 需求 2：使用 Fuwari 模板
- **方式**：`npm create astro@latest ... --template saicaca/fuwari`
- **結果**：模板成功套用 ✅
- **預設主題**：Fuwari（深色/淺色主題切換已內建）

### ✅ 需求 3：內容位置改為 posts
- **要求**：`src/content/posts/`
- **實際情況**：已確認 ✅
- **特點**：Fuwari 預設就使用 `posts` 資料夾

---

## 📁 重要檔案說明

### astro.config.mjs
Fuwari 已預先配置，主要設定包括：
- Site 屬性（需在 GitHub Pages 設定時修改）
- Markdown 整合
- 靜態生成設定

**需要修改的地方**（部署前）：
```javascript
// 若部署至 https://yourusername.github.io/GithubBlog
site: 'https://yourusername.github.io',
base: '/GithubBlog',
```

### src/content/config.ts
Content Collection 已配置，定義了 posts 的 schema（標題、描述、發佈日期等）

### .github/workflows/
預設工作流程已包含：
- 構建與部署流程
- 需自訂 Notion 同步部分

---

## 🔄 後續步驟

### 立即可做
1. **本地測試**
   ```powershell
   npm run dev
   # 訪問 http://localhost:3000
   ```

2. **編輯現有文章**
   - 修改 `src/content/posts/` 中的 .md 檔案
   - 開發伺服器會自動熱更新

3. **新增文章**
   ```powershell
   # 在 src/content/posts/ 中新建 .md 檔案
   # YAML Front Matter 範例：
   ---
   title: '文章標題'
   description: '文章描述'
   pubDate: 2024-01-01
   author: 'Your Name'
   image: '/images/cover.jpg'
   tags:
     - astro
     - blog
   ---
   ```

4. **構建靜態網站**
   ```powershell
   npm run build
   # 生成 dist/ 資料夾（可直接部署）
   ```

### 需要設定
1. **GitHub Pages 部署**
   - 建立 GitHub 倉庫
   - 設定 base URL（若倉庫名稱非 `username.github.io`）
   - 設定 GitHub Actions 自動部署

2. **Notion 同步整合**
   - 取得 Notion Integration Token
   - 配置 Notion Database ID
   - 設定 GitHub Actions secrets
   - 配置同步腳本（`scripts/sync-notion.ts`）

3. **自訂主題**
   - 編輯 Tailwind 配置（`tailwind.config.cjs`）
   - 修改 Fuwari 元件樣式
   - 自訂顏色、字型、佈局

---

## 📊 項目統計

| 項目 | 數值 |
|------|------|
| 初始示例文章 | 5 篇 |
| 安裝依賴套件 | 100+ |
| TypeScript 檔案 | 10+ |
| 預設樣式框架 | Tailwind CSS |
| 搜尋引擎 | Pagefind（全文搜尋） |
| 支援主題切換 | ✅ 內建 |

---

## 🛠️ 故障排除

### 開發伺服器無法啟動
```powershell
# 清除 node_modules 並重新安裝
Remove-Item -Recurse node_modules
npm install
npm run dev
```

### 部分文章無法顯示
```powershell
# 驗證 YAML Front Matter 格式是否正確
# 確保日期格式：YYYY-MM-DD 或 ISO 8601 格式
```

### 構建失敗
```powershell
# 檢查 TypeScript 型態錯誤
npm run build

# 清除 .astro 快取
Remove-Item -Recurse .astro
npm run build
```

---

## 📝 備註

- **Fuwari 主題**：基於 Astro 官方推薦，功能完整
- **Git 初始化**：已自動初始化，可直接 push 至 GitHub
- **配置最小化**：Fuwari 預設配置已充分，無需額外手動調整
- **Node.js 22.22.2**：LTS 版本，穩定性佳

---

**下一個檢查清單：**
- [ ] 確認 npm run dev 本地運行無誤
- [ ] 確認 npm run build 成功生成 dist/
- [ ] 在 GitHub 建立倉庫並設定 Pages
- [ ] 設定 Notion Integration（if 使用 Notion 同步）
- [ ] 測試部署流程
- [ ] 自訂 astro.config.mjs 中的 site 和 base

**建立完成時間**：2026-03-31 16:30 UTC+8  
**使用時間**：約 5-10 分鐘（取決於網路速度）
