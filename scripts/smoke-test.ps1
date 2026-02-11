param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = 'Stop'

function Assert-Ok($condition, [string]$message) {
  if (-not $condition) { throw $message }
}

Write-Host "== Health check ==" -ForegroundColor Cyan
$health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
Assert-Ok ($health.ok -eq $true) "Health check failed"
Write-Host "OK" -ForegroundColor Green

Write-Host "== Create workflow ==" -ForegroundColor Cyan
$body = @{
  name    = "Smoke Test Workflow"
  enabled = $true
  steps   = @(
    @{
      type       = "transform"
      ops        = @(
        @{ op = "default"; path = "actor_name"; value = "Unknown" },
        @{ op = "template"; to = "title"; template = "Event {{type}} by {{actor_name}}" }
      )
    }
  )
} | ConvertTo-Json -Depth 20

$created = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/workflows" -ContentType "application/json" -Body $body
Assert-Ok ($null -ne $created.id) "Expected workflow id"
Assert-Ok ($null -ne $created.triggerPath) "Expected triggerPath"
Write-Host ("Created workflow id={0}" -f $created.id) -ForegroundColor Green
Write-Host ("Trigger: {0}{1}" -f $BaseUrl, $created.triggerPath)

Write-Host "== Trigger workflow ==" -ForegroundColor Cyan
$triggerInput = @{ type = "lock.unlock"; actor_name = "Ajay" } | ConvertTo-Json -Depth 10
$run = Invoke-RestMethod -Method Post -Uri ("$BaseUrl{0}" -f $created.triggerPath) -ContentType "application/json" -Body $triggerInput
Assert-Ok ($null -ne $run.runId) "Expected runId"
Write-Host ("Run id={0} status={1}" -f $run.runId, $run.status) -ForegroundColor Green

if ($run.status -ne 'success' -and $run.status -ne 'skipped') {
  Write-Host "Run error:" -ForegroundColor Yellow
  $run.error | ConvertTo-Json -Depth 10 | Write-Host
  exit 1
}

Write-Host "Smoke test passed." -ForegroundColor Green
