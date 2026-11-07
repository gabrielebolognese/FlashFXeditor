# Usage: powershell -File tts.ps1 <in.txt|in.ssml> <out.wav> <out.json> [voice] [rate]
param([string]$In, [string]$Wav, [string]$Json, [string]$Voice = "Microsoft David Desktop", [int]$Rate = 0)
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @"
using System; using System.Collections.Generic; using System.Speech.Synthesis; using System.Speech.AudioFormat;
public class TtsRun {
  public static string Run(string text, bool ssml, string wav, string voice, int rate) {
    var s = new SpeechSynthesizer();
    s.SelectVoice(voice); s.Rate = rate;
    s.SetOutputToWaveFile(wav, new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
    var sb = new System.Text.StringBuilder(); sb.Append("[");
    bool first = true;
    s.SpeakProgress += (o, e) => {
      if (!first) sb.Append(","); first = false;
      sb.Append("{\"t\":" + e.AudioPosition.TotalMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"w\":\"" + e.Text.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\"pos\":" + e.CharacterPosition + ",\"len\":" + e.CharacterCount + "}");
    };
    if (ssml) s.SpeakSsml(text); else s.Speak(text);
    s.SetOutputToNull(); s.Dispose();
    sb.Append("]"); return sb.ToString();
  }
}
"@
$text = [IO.File]::ReadAllText($In)
$ssml = $In.ToLower().EndsWith(".ssml")
$out = [TtsRun]::Run($text, $ssml, $Wav, $Voice, $Rate)
[IO.File]::WriteAllText($Json, $out)
