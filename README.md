# MAARU 訂單查詢（Order-status）

顧客訂單查詢中心：**訂單編號查配送進度** · **會員卡號查全部訂單**

線上：https://maaru-jp.github.io/Order-status/

---

## 本 repo 是什麼

這是 **GitHub Pages 靜態前端**（`index.html`）。  
API 與試算表在另一專案 **ProductManagement2-main** 的 `Code.gs`，兩邊共用同一支 GAS URL。

詳細整合說明見 **[MAARU_INTEGRATION.md](./MAARU_INTEGRATION.md)**。

---

## 快速部署

1. 將本 repo push 到 GitHub（`maaru-jp/Order-status`）
2. 確認 Pages 已啟用（`.github/workflows/static.yml` 會自動部署）
3. 同目錄放置 Logo：`S__283426825.jpg`
4. **ProductManagement2** 的 `Code.gs` 重新部署後，本頁即可查詢

---

## 功能

- **訂單編號**：5 碼數字，顯示配送時間軸、品項出貨狀態
- **會員卡號**：13 碼純數字，列出歷史訂單，點選可進入該筆進度
- 與官網紅利／訂單頁共用卡號記憶（`maarushop_member_card_v1`）

---

## 舊版 standalone

早期獨立試算表 + `OrderStatus.gs` 方案已封存於 `legacy/`，請勿再部署。
