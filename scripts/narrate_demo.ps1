$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$demoRoot = Join-Path $PSScriptRoot '..\output\demo'
$demoSegments = Get-Content -LiteralPath (Join-Path $demoRoot 'segments.json') -Raw | ConvertFrom-Json
$demoSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $demoSynth.SelectVoice('Microsoft David Desktop')
    $demoSynth.Rate = 0
    foreach ($segment in $demoSegments) {
        $demoAudio = [System.IO.Path]::GetFullPath((Join-Path $demoRoot ($segment.number + '.wav')))
        $demoSynth.SetOutputToWaveFile($demoAudio)
        $demoSynth.Speak([string]$segment.text)
        $demoSynth.SetOutputToNull()
        Write-Output ('Narrated segment ' + $segment.number)
    }
}
finally { $demoSynth.Dispose() }
