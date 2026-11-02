# TradeSoft Complete Data Migration Reference

**Date Documented:** 31-10-2026  
**Source Archive:** `D:\tradesoft-complete-all-data.zip` (112 MB)  
**Security Status:** Read-Only Source preserved at root of D:\

---

## 1. Authentication & Engine Parameters
* **Database Engine:** Microsoft Jet 4.0 (Access 2000 format) / ACE 12.0/16.0
* **Master Database Password:** `abrakadabra@28121976`
* **Applicability:** Works for all `.mdb` files across all firms and years (`Company.mdb`, `CompanyInfo.mdb`, `PHDATA*.mdb`).
* **Connection String (OLEDB 12.0/16.0):**
  ```powershell
  Provider=Microsoft.ACE.OLEDB.12.0;Data Source=<path_to_mdb>;Jet OLEDB:Database Password=abrakadabra@28121976;
  ```

---

## 2. Firms & Directory Structure
1. **Firm 1 (CompCode: `NAINTOOL` / `NAINTOOLS`):**
   * **Name:** `NAIN TOOLS AND SS BOLT CO.` / `NAIN TOOLS & S.S BOLT CO.`
   * **Historical Data (2018–2024):** Located in `Data/NAINTOOLS/PHDATA2018.mdb` through `PHDATA2024.mdb`
   * **Active / Current Data (2025+):** Located in `Data/NAINTOOL/PHDATA2025.mdb`
2. **Firm 2 (CompCode: `NR`):**
   * **Name:** `NR FASTNER`
   * **Historical & Active Data (2019–2025):** Located in `Data/NR/PHDATA2019.mdb` through `PHDATA2025.mdb`

---

## 3. Database Audit & Inventory

### Firm 1: NAIN TOOLS
| Database | Period Covered | Sales Invoices (`Gas_SaleExMas`) | Purchase Bills (`Gas_PurcExMas`) | Products (`Gas_ItMas`) | Parties (`AccMas`) | Vouchers (`VouchMas`) | Adjustments (`AdjustMas`) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **PHDATA2018** | 2018-04 to 2019-03 | 902 | 645 | 1,914 | 237 | 8,517 | 1,778 |
| **PHDATA2019** | 2019-04 to 2020-03 | 944 | 547 | 2,606 | 338 | 8,688 | 2,058 |
| **PHDATA2020** | 2020-04 to 2021-03 | 982 | 404 | 2,515 | 396 | 8,116 | 1,939 |
| **PHDATA2021** | 2021-04 to 2022-03 | 1,526 | 637 | 3,138 | 574 | 13,056 | 3,365 |
| **PHDATA2022** | 2022-04 to 2023-03 | 2,259 | 685 | 3,896 | 740 | 16,747 | 4,682 |
| **PHDATA2023** | 2023-04 to 2024-03 | 2,203 | 687 | 4,719 | 868 | 16,272 | 4,720 |
| **PHDATA2024** | 2023-04 to 2025-03 | 4,041 | 1,235 | 5,141 | 969 | 29,490 | 9,033 |
| **PHDATA2025** | 2025-04 to 2025-09 | 740 | 216 | 1,145 | 349 | 5,259 | 1,758 |

### Firm 2: NR FASTNER
| Database | Period Covered | Sales Invoices | Purchase Bills | Products | Parties |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **PHDATA2019 – 2024** | 2019 to 2025 | 869 | 148 | Up to 994 | Up to 162 |
| **PHDATA2025** | 2025-04 to 2025-08 | 36 | 5 | 1,023 | 169 |

---

## 4. Key Table Schema Map
* **Parties (Customers & Suppliers):** `AccMas`
  - Columns: `Acccode`, `Accname`, `Address1`, `Address2`, `Address3`, `Citycode`, `GstNo`, `PanNo`, `StateName`, `OpBal`, `Drcr`
* **Items (Products):** `Gas_ItMas`
  - Columns: `Itcode`, `Itname`, `Unitcode`, `CateCode`, `SaleRate`, `PurcRate`, `HsnCode`, `OpStock`, `Stock`
* **Sales Bills (GST Invoices):** `Gas_SaleExMas` & `Gas_SaleExDet`
  - Header: `Billno`, `BillDate`, `Acccode`, `BillAmt`, `TaxAmt`, `RoundOffAmt`, `Freight`, `ChallanNo`, `PaymentTerms`
  - Items: `Billno`, `Itcode`, `Qty`, `Rate`, `AEDAmt`, `NetAmt`, `HsnCode`
* **Purchase Bills:** `Gas_PurcExMas` & `Gas_PurcExDet`
* **Payment Adjustments:** `AdjustMas` (contains exact bill-to-payment mappings)
* **Vouchers & Cheques:** `VouchMas` (Cash, Bank, Cheque receipts and payments)

