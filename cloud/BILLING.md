# 預付 OCR 管理後台（尚未正式啟用）

方案：試用 10 頁（每個客戶代號限一次）、NT$199／100 頁、NT$499／500 頁、NT$999／1,500 頁。點數不自動到期，收款後管理員手動加點。不是金流或發票系統。

## 部署階段

本次更新預設不收費，未設定 BILLING_ENABLED 時仍使用原 OCR_ACCESS_CODE。正式啟用後不接受舊共用碼，也不接受管理員密碼作為 OCR 使用碼。

在 Google Cloud Shell 的專案資料夾：
~~~bash
cd ~/registry-google-ocr
git pull --ff-only origin main
bash cloud/prepare-billing.sh
~~~

此腳本會先提示確認，再建立 ocr-billing Firestore Native 資料庫（asia-east1、刪除保護）、設定 OCR 結果 TTL、授予執行服務帳戶資料庫權限、以 Secret Manager 保存獨立管理員密碼，更新服務。這些服務會有額外費用，命名資料庫不可假定享有預設資料庫的免費額度。管理員密碼請用密碼管理器生成 32 字元以上亂數，不要貼進聊天或 Git。

腳本設置 BILLING_ENABLED=true,BILLING_ADMIN_ONLY=true：
- 管理後台可建立客戶、加點、停用、查閱紀錄。
- 公開 OCR 仍使用原有使用碼，不扣點。
- 畫面不顯示客戶點數面板，直到正式切換。

管理網址：https://registry-ocr-tynlgrdn2a-de.a.run.app/admin.html（或 GitHub Pages 下的 admin.html）。
同一個真實客戶請固定使用唯一代號，避免管理員以不同代號重複送試用。完整客戶使用碼只在建立當次顯示；後端只保存雜湊。必須先保管好再交付客戶。此版提供停用／重新啟用，尚無遺失使用碼的輪替功能。

## 正式切換前檢查（需另行確認）

1. 實際雲端資料庫建立／加點／停用測試通過，確認角色權限及 TTL 已生效。
2. 保存舊使用碼但不提供給新客戶；先建立新客戶、交付各自使用碼並通知切換時間。
3. 先在獨立測試服務做真實辨識驗收：成功扣 1 點、空結果／失敗退點、斷線續接、舊碼不能辨識、不同客戶不能看到彼此紀錄。自動化測試使用模擬資料庫與 OCR，不等同雲端驗收。
4. 決定收款、退款、個資與保存政策；設定帳單預算提醒、備份與安全稽核。不要以「零錯字」銷售。
5. 經管理員確認後才執行：
~~~bash
gcloud run services update registry-ocr --project=registry-ocr-123456 --region=asia-east1 --update-env-vars=BILLING_ADMIN_ONLY=false
~~~
確認 /api/health 的 billingEnabled 為 true，Ctrl+F5 更新客戶網站，再以測試客戶驗收。正式測試會呼叫付費 OCR。

日後更新使用 bash cloud/update-service.sh，它保留環境變數與 Secret Manager 設定。不要用初始 deploy.sh 重設正式服務。

## 計費一致性與資料保存

- 每張輸入頁面先保留 1 點，OCR 回傳非空文字後正式計費。程式不辨識圖片是否其實拼接多頁，不承諾防止所有使用碼轉借；每碼僅允許一頁同時處理。
- Firestore commit 同時寫入餘額與帳本，使用更新版本條件防止跨實例競爭。辨識編號綁定影像雜湊，重送同編號不重扣。
- 已完成頁面的重試可於 24 小時內取回原文字，不再呼叫 OCR。逾時不提供快取，但永久帳本仍阻止同操作再次計費。客戶按「清除待續接任務」後重掃屬於新作業。
- 網頁將未完成任務的亂數編號及不可逆檔案指紋存在 sessionStorage，不存使用碼或 OCR 文字。關閉分頁可能失去續接資訊；先保存結果，頁面未完成時不要任意清除。
- 正常辨識失敗立即退點；伺服器中斷時，保留點數在 3 分鐘後的下一次餘額查詢／辨識操作自動退回。這是查詢觸發，不是背景定時退款。
- 一份文件部分成功、部分失敗時，成功頁仍計費；續接不重新扣已完成頁。無文字頁不扣點，Google 可能仍向網站經營者收費。
- 不將原始圖片寫入資料庫。OCR 文字快取以到期欄位供 TTL 刪除；24 小時後停止提供，實際刪除有排程延遲，不可宣稱恰好 24 小時永久刪除。
- 帳本保留點數、金額、收款備註與時間，不保留原始圖片／住址文字。客戶名稱與帳戶另存；請勿在收款備註輸入謄本或個資。
- 管理員密碼有完整管理權，不與客戶共用；避免公用電腦與瀏覽器擴充套件外洩。管理 API 需要密碼，即使知道 admin.html 網址也不能查資料。

## 測試

~~~bash
node --test cloud/*.test.mjs
~~~

參考：[Firestore 原子提交](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit)、[版本前置條件](https://firebase.google.com/docs/firestore/reference/rest/v1/Precondition)、[TTL 刪除延遲](https://docs.cloud.google.com/firestore/native/docs/ttl)、[Cloud Run Secret Manager](https://docs.cloud.google.com/run/docs/configuring/services/secrets)。