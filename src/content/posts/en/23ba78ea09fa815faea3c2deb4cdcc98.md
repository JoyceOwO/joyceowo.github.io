---
title: "Azure Hybrid Connection in Practice: Securely Connecting Cloud to On-Premises Services"
published: 2025-07-25
updated: 2026-04-15
description: "Azure Hybrid Connection in Practice: Securely Connecting Cloud to On-Premises Services"
tags:
  - "Azure"
category: ""
# notionPageId: "23ba78ea-09fa-815f-aea3-c2deb4cdcc98"
lang: "en"
---
  
## Conclusion

- Using Hybrid Connection allows Azure Web Apps to securely connect back to on-premises services **without opening a VPN or exposing an IP address**.
## Where It's Suitable

- Web App needs to connect to on-premises DB / API
- Don't want to open a VPN or Public IP
- Company's internal network services cannot be exposed externally
- Want to quickly establish cloud-to-on-premises connectivity (low operational cost)
## Steps

### 1. Create a Hybrid Connection (Cloud Side)

- Create a Hybrid Connection in the Azure Portal
- Configure the target:
  - Host (on-premises service IP / hostname)
  - Port (e.g., 1433 / 80 / 443)
- Essentially, Azure creates a "relay tunnel" for you, not a direct connection
![image](../../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-7255d1681c2.png)

### 2. Bind Web App to Hybrid Connection

- Go to Web App → Networking → Hybrid Connections
- Add the Hybrid Connection you just created
- Once bound, when the Web App accesses that Host:Port, it will automatically use this tunnel
![image](../../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-a6659663d789.png)

### 3. Install Connection Manager On-Premises

- Install Hybrid Connection Manager (HCM)
- Log in to your Azure account and select the Hybrid Connection
- HCM actively "establishes an outbound connection to Azure" (key point)
- No need to open inbound ports (less firewall pressure)
![image](../../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-86380e5ff177.png)

### 4. Verify Connection

- Web App directly uses:
  - Host (the configured name)
  - Port
- No need to change DNS, no need to change application architecture
- Success means the cloud → on-premises tunnel has been established
## Additional Notes

- HCM **initiates outbound connections**, so no need to open inbound firewall ports (common misconception)
- Only supports TCP, not UDP
- If unable to connect, first check:
  - Is HCM Online
  - Is the Port correct
  - Does the on-premises service allow local connections
## Commands / Examples

<details>
<summary>Click to expand</summary>

```plain text
# 測試連線（Web App Console）
tcpping your-host 1433

# 常見 DB 連線字串（範例）
Server=your-host,1433;Database=DB;User Id=xxx;Password=xxx;
```

</details>

## Conclusion

- Hybrid Connection is like a "secretly drilled secure pipeline" that works reliably even without a VPN; first, ensure HCM is online, then address other issues.
## References

[https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections](https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections)
