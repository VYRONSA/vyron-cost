$ErrorActionPreference = "Stop"

$base = "https://vyron-cost-2nfn92fwa-base2gvs-projects.vercel.app"
$cookie = "vyron_workspace_user_session=%7B%22userId%22%3A%2271e6fa89-01ad-433f-af80-b754f6dd1c13%22%2C%22email%22%3A%22precisionaccounting%40gmail.com%22%2C%22firstName%22%3A%22Gerhard%22%2C%22surname%22%3A%22van%20Schalkwyk%22%2C%22role%22%3A%22OWNER%22%2C%22permissions%22%3A%7B%7D%7D; vyron_cost_active_client=%7B%22id%22%3A%22928710a1-ec4a-4f4b-bd31-233c94ad9c78%22%2C%22companyId%22%3A%2230df5bad-5dff-495c-9923-8484fab7ad37%22%2C%22companyName%22%3A%22Northwood%20Management%20Investment%22%2C%22tradingName%22%3A%22Cutting%20Edge%20Cuisine%22%2C%22packageName%22%3A%22Starter%22%2C%22status%22%3A%22Setup%22%2C%22ownerUserId%22%3A%2271e6fa89-01ad-433f-af80-b754f6dd1c13%22%2C%22ownerEmail%22%3A%22precisionaccounting%40gmail.com%22%2C%22contactEmail%22%3A%22precisionaccounting%40gmail.com%22%2C%22phone%22%3A%220215519409%22%2C%22userLimit%22%3A3%2C%22demoMode%22%3Afalse%2C%22impersonating%22%3Atrue%2C%22loginDisplayStatus%22%3A%22active_login%22%7D"

$pdf = "C:\Users\humres\vyron-cost-web\tmp-preview-invoice.pdf"
$pdfLines = @(
  "%PDF-1.4",
  "1 0 obj",
  "<< /Type /Catalog /Pages 2 0 R >>",
  "endobj",
  "2 0 obj",
  "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
  "endobj",
  "3 0 obj",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  "endobj",
  "4 0 obj",
  "<< /Length 86 >>",
  "stream",
  "BT",
  "/F1 24 Tf",
  "72 720 Td",
  "(Invoice TEST-1001) Tj",
  "0 -32 Td",
  "(Supplier Alpha Foods) Tj",
  "ET",
  "endstream",
  "endobj",
  "5 0 obj",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "endobj",
  "xref",
  "0 6",
  "0000000000 65535 f ",
  "0000000010 00000 n ",
  "0000000062 00000 n ",
  "0000000119 00000 n ",
  "0000000245 00000 n ",
  "0000000381 00000 n ",
  "trailer",
  "<< /Size 6 /Root 1 0 R >>",
  "startxref",
  "451",
  "%%EOF"
)
Set-Content -Path $pdf -Value $pdfLines -Encoding ascii

$ws = npx vercel curl "$base/api/workspace/status" -H "Cookie: $cookie" | Out-String
Set-Content -Path "C:\Users\humres\vyron-cost-web\tmp-preview-ws.json" -Value $ws -Encoding utf8

$upload = npx vercel curl "$base/api/documents/upload" -X POST -H "Cookie: $cookie" -F "file=@$pdf;type=application/pdf" | Out-String
Set-Content -Path "C:\Users\humres\vyron-cost-web\tmp-preview-upload.json" -Value $upload -Encoding utf8
$uploadObj = $upload | ConvertFrom-Json
if (-not $uploadObj.ok) { throw "Upload failed" }
$docId = [string]$uploadObj.documentId
Set-Content -Path "C:\Users\humres\vyron-cost-web\tmp-preview-docid.txt" -Value $docId -Encoding ascii

$reviewBefore = npx vercel curl "$base/api/documents/$docId/review" -H "Cookie: $cookie" | Out-String
Set-Content -Path "C:\Users\humres\vyron-cost-web\tmp-preview-review-before.json" -Value $reviewBefore -Encoding utf8

$extract = npx vercel curl "$base/api/documents/$docId/extract" -X POST -H "Cookie: $cookie" | Out-String
Set-Content -Path "C:\Users\humres\vyron-cost-web\tmp-preview-extract.json" -Value $extract -Encoding utf8

$reviewAfter = npx vercel curl "$base/api/documents/$docId/review" -H "Cookie: $cookie" | Out-String
Set-Content -Path "C:\Users\humres\vyron-cost-web\tmp-preview-review-after.json" -Value $reviewAfter -Encoding utf8

Write-Output "DOC_ID=$docId"
Write-Output "DONE"
