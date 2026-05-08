---
name: load-orders
description: Load order data from an Excel file into the mock ORDER_DB for the customer support agent.
---

## Purpose
Parse an Excel file of order data and populate the mock `ORDER_DB` in `src/tools/getOrderStatus.ts`

Get the excel file location from the user.

## When to use
Invoke when a developer provides an Excel (.xlsx or .csv) file and wants its rows converted into mock order entries for the support agent to process.

## Expected Excel columns
| Column            | Description                                          |
|-------------------|------------------------------------------------------|
| `orderId`         | Order ID string, e.g. ORD-1234                       |
| `status`          | One of: `in_transit`, `delivered`, `delayed`, `lost` |
| `estimatedDelivery` | Date in YYYY-MM-DD format                          |
| `customerName`    | Customer's first name                                |

## Steps

1. **Read the file** — file path is `$ARGUMENTS`. If empty, ask the developer for the path. Read the file content.
   - For `.csv`: parse rows directly.
   - For `.xlsx`: use the `xlsx` npm package (`npx tsx -e "require('xlsx')"`) or ask the developer to export as CSV if the package is unavailable.

2. **Validate each row** — ensure `status` is one of `in_transit | delivered | delayed | lost`. Skip rows with missing `orderId` and warn the developer.

3. **Build the ORDER_DB entries** — convert each valid row into this TypeScript object shape:
   ```ts
   'ORD-XXXX': {
     orderId: 'ORD-XXXX',
     status: 'in_transit',
     estimatedDelivery: 'YYYY-MM-DD',
     customerName: 'Name',
   },
   ```

4. **Update `src/data/orders.json`** — replace the existing entries with the newly generated ones. 

5. **Confirm** — report how many orders were loaded and list their IDs.

## Notes
- Never fabricate order IDs or statuses — only use values from the file.
- If `estimatedDelivery` is missing or unparseable, use `'unknown'`.
- If `customerName` is missing, use `'Customer'` as the fallback (matches the existing lost-order default).
- Dates must be ISO format (YYYY-MM-DD) in the output regardless of the format in the Excel file.
