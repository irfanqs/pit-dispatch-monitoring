$ErrorActionPreference = "Stop"
$envPath = Join-Path $PSScriptRoot ".env"
$lines = [System.Collections.Generic.List[string]]::new()

if (Test-Path $envPath) {
    foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
        $lines.Add($line)
    }
}
else {
    @(
        "AI_PROVIDER=openrouter",
        "AI_FALLBACK_PROVIDER=groq",
        "OPENROUTER_MODEL=z-ai/glm-5.2:free",
        "GROQ_MODEL=qwen/qwen3.8-27b"
    ) | ForEach-Object { $lines.Add($_) }
}

function Read-ApiKey([string] $Prompt) {
    $secureValue = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        return $plainValue.Trim()
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Get-EnvValue([string] $Name) {
    $pattern = '^\s*' + [Regex]::Escape($Name) + '\s*=\s*(.*?)\s*$'
    foreach ($line in $lines) {
        if ($line -match $pattern) {
            $value = $Matches[1].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            return $value
        }
    }
    return ""
}

function Set-EnvValue([string] $Name, [string] $Value) {
    $pattern = '^\s*' + [Regex]::Escape($Name) + '\s*='
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            $lines[$index] = "$Name=$Value"
            return
        }
    }
    $lines.Add("$Name=$Value")
}

try {
    $changed = $false
    foreach ($keyName in @("OPENROUTER_API_KEY", "GROQ_API_KEY")) {
        if ([string]::IsNullOrWhiteSpace((Get-EnvValue $keyName))) {
            $providerName = if ($keyName -eq "OPENROUTER_API_KEY") { "OpenRouter" } else { "Groq fallback" }
            $keyValue = Read-ApiKey "$providerName API key"
            if ([string]::IsNullOrWhiteSpace($keyValue)) {
                throw "$providerName API key cannot be blank."
            }
            if ($keyValue.Contains("`n") -or $keyValue.Contains("`r")) {
                throw "API keys cannot contain line breaks."
            }
            Set-EnvValue $keyName $keyValue
            $changed = $true
        }
    }

    if ($changed) {
        [System.IO.File]::WriteAllLines($envPath, $lines.ToArray(), [System.Text.UTF8Encoding]::new($false))
        Write-Host "Missing API key values saved to .env. Key values were not displayed."
    }
    else {
        Write-Host "OpenRouter and Groq API keys already configured."
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    $keyValue = $null
}
