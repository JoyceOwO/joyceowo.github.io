---
title: "Azure Hybrid Connection in Practice: Securely Connecting Cloud to On-premises Services"
published: 2025-07-25
updated: 2026-04-15
description: "Azure Hybrid Connection in Practice: Securely Connecting Cloud to On-premises Services"
tags:
  - "Azure"
category: ""
# notionPageId: "23ba78ea-09fa-815f-aea3-c2deb4cdcc98"
lang: "en"
---


## Conclusion

- With Hybrid Connection, Azure Web Apps can **without opening a VPN or exposing IPs**, directly and securely connect back to on-premises services.
## Where It's Suitable

- Web Apps need to connect to on-premises DB / API
- Don't want to open a VPN or Public IP
- Company internal network services cannot be exposed externally
- Want to quickly establish cloud-to-on-premises connectivity (low operational cost)
## Process Steps

### 1. Create a Hybrid Connection (Cloud Side)

- Create a Hybrid Connection in the Azure Portal
- Configure the target:
  - Host (on-premises service IP / hostname)
  - Port (e.g., 1433 / 80 / 443)
- Essentially, Azure helps you establish a 'relay channel', not a direct connection
![image](../../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-7255d1681c2.png)

### 2. Bind Web App to Hybrid Connection

- Go to Web App → Networking → Hybrid Connections
- Add the Hybrid Connection just created
- After binding, when the Web App accesses that Host:Port, it will automatically use this channel
![image](../../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-a6659663d789.png)

### 3. Install Connection Manager On-premises

- Install Hybrid Connection Manager (HCM)
- Log in to your Azure account and select the Hybrid Connection
- HCM will actively 'establish an outbound connection to Azure' (key point)
- No inbound port needs to be opened (less firewall pressure)
![image](../../../assets/notion-images/23ba78ea09fa815faea3c2deb4cdcc98/23ba78ea09fa815faea3c2deb4cdcc98-86380e5ff177.png)

### 4. Verify Connection

- Web App directly uses:
  - Host (the configured name)
  - Port
- No need to change DNS, no need to change application architecture
- Success means the cloud → on-premises channel is established
## Additional Notes

- HCM **initiates outbound connections**, so no inbound firewall port needs to be opened (common misconception)
- Only supports TCP, not UDP
- If unable to connect, first check:
  - If HCM is Online
  - If the Port is correct
  - If the on-premises service allows local connections
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

## Wrap-up

- Hybrid Connection is like a 'secretly drilled secure tunnel', allowing stable communication without a VPN; first, ensure HCM is online, then address other issues.
## References

[https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections](https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections)
