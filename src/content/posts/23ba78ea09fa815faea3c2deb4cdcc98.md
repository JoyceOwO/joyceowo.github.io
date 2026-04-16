---
title: "Azure Hybrid Connection 實戰：讓雲端安全連回地端服務"
published: 2025-07-25
updated: 2026-04-15
description: ""
tags:
  - "Azure"
category: ""
# notionPageId: "23ba78ea-09fa-815f-aea3-c2deb4cdcc98"
---
  

## 結論

- 用 Hybrid Connection 可以讓 Azure Web App **不開 VPN、不曝露 IP**，直接安全連回地端服務。
## 適合用在哪裡

- Web App 需要連地端 DB / API
- 不想開 VPN 或 Public IP
- 公司內網服務不能對外開放
- 想快速打通雲地連線（低維運成本）
## 流程步驟

### 1. 建立 Hybrid Connection（雲端端）

- 在 Azure Portal 建立 Hybrid Connection
- 設定目標：
  - Host（地端服務 IP / hostname）
  - Port（例如 1433 / 80 / 443）
- 本質是 Azure 幫你建立一條「轉送通道」，不是直接連線
![image](../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-7255d168e1c2.png)

### 2. Web App 綁定 Hybrid Connection

- 到 Web App → Networking → Hybrid Connections
- 加入剛剛建立的 Hybrid Connection
- 綁定後，Web App 存取該 Host:Port 時，會自動走這條通道
![image](../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-a6659663d789.png)

### 3. 地端安裝 Connection Manager

- 安裝 Hybrid Connection Manager（HCM）
- 登入 Azure 帳號並選擇該 Hybrid Connection
- HCM 會主動「向 Azure 建立 outbound 連線」（重點）
- 不需要開 inbound port（防火牆壓力小）
![image](../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-86380e5ff177.png)

### 4. 驗證連線

- Web App 直接用：
  - Host（設定的名稱）
  - Port
- 不需改 DNS、不需改程式架構
- 成功即代表雲端 → 地端通道已建立
## 補充

- HCM 是 **主動連出去**，所以不用開防火牆 inbound（常見誤解）
- 只支援 TCP，不支援 UDP
- 若連不到，先確認：
  - HCM 是否 Online
  - Port 是否正確
  - 地端服務是否允許本機連線
## 指令 / 範例整理

<details>
<summary>Click to expand</summary>

```plain text
# 測試連線（Web App Console）
tcpping your-host 1433

# 常見 DB 連線字串（範例）
Server=your-host,1433;Database=DB;User Id=xxx;Password=xxx;
```

</details>

## 收尾

- Hybrid Connection 就像一條「偷偷打洞的安全管道」，不用 VPN 也能穩穩通；先確認 HCM 在線，再談其他問題。
## 參考來源

[https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections](https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections)

