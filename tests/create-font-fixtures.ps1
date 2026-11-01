$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$target = Join-Path $PSScriptRoot 'ocr-fixtures'
New-Item -ItemType Directory -Force -Path $target | Out-Null
$cases = @(
  @{Id='yahei-regular';Font='微软雅黑';Size=22;Bg='#ffffff';Ink='#181818'},
  @{Id='yahei-small-light';Font='微软雅黑 Light';Size=12;Bg='#ffffff';Ink='#828282'},
  @{Id='yahei-bold';Font='微软雅黑';Size=20;Bg='#ffffff';Ink='#222222';Bold=$true},
  @{Id='heiti';Font='黑体';Size=19;Bg='#f8f8f8';Ink='#303030'},
  @{Id='songti';Font='宋体';Size=19;Bg='#ffffff';Ink='#242424'},
  @{Id='kaiti';Font='楷体';Size=18;Bg='#ffffff';Ink='#333333'},
  @{Id='fangsong-small';Font='仿宋';Size=14;Bg='#fbfbfb';Ink='#777777'},
  @{Id='xingkai-theme';Font='华文行楷';Size=22;Bg='#ffffff';Ink='#333333'},
  @{Id='caiyun-outline';Font='华文彩云';Size=22;Bg='#ffffff';Ink='#444444'},
  @{Id='dark-theme';Font='楷体';Size=17;Bg='#141418';Ink='#ebebeb'},
  @{Id='low-contrast';Font='微软雅黑 Light';Size=16;Bg='#dedede';Ink='#b0b0b0'},
  @{Id='mixed-size-detail';Font='微软雅黑';Size=17;Bg='#ffffff';Ink='#555555';Detail=$true},
  @{Id='two-column-list';Font='华文楷体';Size=18;Bg='#ffffff';Ink='#333333';Columns=$true},
  @{Id='compressed-theme';Font='楷体';Size=15;Bg='#f9f6f0';Ink='#8c8273';Jpeg=$true}
)
$metadata = @()
foreach ($case in $cases) {
  $bitmap = [System.Drawing.Bitmap]::new(640,900,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($case.Bg))
  $graphics.TextRenderingHint = 'AntiAliasGridFit'
  $style = if ($case.Bold) {[System.Drawing.FontStyle]::Bold} else {[System.Drawing.FontStyle]::Regular}
  $font = [System.Drawing.Font]::new($case.Font,$case.Size,$style,[System.Drawing.GraphicsUnit]::Pixel)
  $actualFont = $font.FontFamily.Name
  if ($actualFont -notmatch '微软|宋|楷|黑|仿|彩云') {throw "Font unavailable: $($case.Font) -> $actualFont"}
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($case.Ink))
  $expected = @(
    @{merchant='瑞幸咖啡';amount=1490;date='2026-10-31';type='expense'},
    @{merchant='地铁出行';amount=600;date='2026-10-31';type='expense'},
    @{merchant='工资';amount=850000;date='2026-10-30';type='income'}
  )
  if ($case.Detail) {
    $expected = @(@{merchant='瑞幸咖啡';amount=1490;date='2026-10-31';type='expense'})
    $lines = @('微信支付','账单详情','瑞幸咖啡','-14.90','支付成功','商品说明: 瑞幸咖啡','支付时间: 2026年10月31日 08:30','支付方式: 零钱')
    for ($i=0;$i -lt $lines.Count;$i++) {
      $drawFont = $font
      if ($i -eq 3) {$drawFont = [System.Drawing.Font]::new('Arial',46,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)}
      $graphics.DrawString($lines[$i],$drawFont,$brush,35,(65+$i*79))
      if ($i -eq 3) {$drawFont.Dispose()}
    }
  } elseif ($case.Columns) {
    $lines = @(@('支付宝',''),@('账单',''),@('2026年10月31日',''),@('瑞幸咖啡','-14.90'),@('地铁出行','-6.00'),@('2026年10月30日',''),@('工资','+8500.00'))
    for ($i=0;$i -lt $lines.Count;$i++) {
      $graphics.DrawString($lines[$i][0],$font,$brush,35,(65+$i*80))
      if ($lines[$i][1]) {$graphics.DrawString($lines[$i][1],$font,$brush,460,(65+$i*80))}
    }
  } else {
    $lines = @('支付宝','账单','2026年10月31日','瑞幸咖啡 -14.90','地铁出行 -6.00','2026年10月30日','工资 +8500.00')
    for ($i=0;$i -lt $lines.Count;$i++) {$graphics.DrawString($lines[$i],$font,$brush,35,(65+$i*80))}
  }
  $graphics.Dispose();$font.Dispose();$brush.Dispose()
  if ($case.Jpeg) {
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
    $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]32)
    $memory = [System.IO.MemoryStream]::new()
    $bitmap.Save($memory,$codec,$parameters)
    $memory.Position=0
    $compressed = [System.Drawing.Bitmap]::new($memory)
    $bitmap.Dispose();$bitmap=$compressed
  }
  $bitmap.Save((Join-Path $target ($case.Id+'.bmp')),[System.Drawing.Imaging.ImageFormat]::Bmp)
  $bitmap.Save((Join-Path $target ($case.Id+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  if ($case.Jpeg) {$memory.Dispose();$parameters.Dispose()}
  $metadata += @{id=$case.Id;font=$actualFont;fontSizePx=$case.Size;synthetic=$true;file=$case.Id+'.bmp';preview=$case.Id+'.png';expected=$expected;reference='2026-11-01';source=$(if($case.Detail){'wechat'}else{'alipay'})}
}
$metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target 'cases.json') -Encoding utf8
Write-Output "Created $($metadata.Count) synthetic OCR font cases."
