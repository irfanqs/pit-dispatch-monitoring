$ErrorActionPreference = "Stop"
$envPath = Join-Path $PSScriptRoot ".env"

if (Test-Path $envPath) {
    Write-Host ".env already exists. Leaving it unchanged."
    exit 0
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

try {
    $openRouterKey = Read-ApiKey "OpenRouter API key (required)"
    $groqKey = Read-ApiKey "Groq API key (required for fallback)"

    if ([string]::IsNullOrWhiteSpace($openRouterKey) -or [string]::IsNullOrWhiteSpace($groqKey)) {
        throw "Both API keys are required."
    }
    if ($openRouterKey.Contains("`n") -or $openRouterKey.Contains("`r") -or $groqKey.Contains("`n") -or $groqKey.Contains("`r")) {
        throw "API keys cannot contain line breaks."
    }

    $lines = @(
        "AI_PROVIDER=openrouter",
        "AI_FALLBACK_PROVIDER=groq",
        "OPENROUTER_API_KEY=$openRouterKey",
        "OPENROUTER_MODEL=z-ai/glm-5.2:free",
        "GROQ_API_KEY=$groqKey",
        "GROQ_MODEL=qwen/qwen3.8-27b"
    )
    [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
    Write-Host ".env created. API key values were not displayed."
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    $openRouterKey = $null
    $groqKey = $null
}
