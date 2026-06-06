# Handcrafted Food Products — Excel import

Copy these files into this folder:

1. `GOURMET COSTINGS.xlsx`
2. `REC211 Recipes for Production.xlsx`
3. `NEW COSTING SHEET.xlsx`

Then from the project root:

```bash
npm run import:handcrafted
```

Or pass explicit paths:

```bash
node scripts/import-handcrafted.mjs --gourmet "C:\path\GOURMET COSTINGS.xlsx" --recipes "C:\path\REC211 Recipes for Production.xlsx" --costing "C:\path\NEW COSTING SHEET.xlsx"
```

Output: `data/generated/handcrafted-tenant.json` (bundled into the app at build time).

Replace `public/clients/handcrafted/logo.svg` with the client logo (`logo.png` recommended; update `logo_url` in import script if needed).
