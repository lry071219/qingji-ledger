Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach ($size in @(192,512)) {
  $bitmap = New-Object System.Drawing.Bitmap($size,$size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = 'AntiAlias'
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#245c47'))
  $paper = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#eff5e9'))
  $edge = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#a2c4a3'))
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#245c47'),($size*0.035))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $graphics.FillRectangle($paper,($size*0.26),($size*0.23),($size*0.48),($size*0.55))
  $graphics.FillRectangle($edge,($size*0.26),($size*0.23),($size*0.08),($size*0.55))
  foreach ($offset in @(0.40,0.51,0.62)) {$graphics.DrawLine($pen,($size*0.44),($size*$offset),($size*0.65),($size*$offset))}
  $bitmap.Save((Join-Path $projectRoot "dist/assets/icon-$size.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose(); $paper.Dispose(); $edge.Dispose(); $pen.Dispose()
}
foreach ($platform in @('wechat','alipay')) {
  $bitmap = New-Object System.Drawing.Bitmap(900,1200)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.TextRenderingHint = 'AntiAliasGridFit'
  $font = New-Object System.Drawing.Font('Microsoft YaHei',30)
  $bigFont = New-Object System.Drawing.Font('Microsoft YaHei',46)
  $black = [System.Drawing.Brushes]::Black
  if ($platform -eq 'wechat') {
    $lines = @('微信支付','账单详情','瑞幸咖啡','-14.90','支付成功','商品说明: 瑞幸咖啡','支付时间: 2026年10月31日 08:30','支付方式: 零钱')
  } else {
    $lines = @('支付宝','账单','2026年10月31日','盒马鲜生  -86.30','地铁出行  -6.00','2026年10月30日','工资  +8500.00')
  }
  $y = 65
  foreach ($line in $lines) {
    $graphics.DrawString($line,$font,$black,55,$y)
    $y += 110
  }
  $bitmap.Save((Join-Path $PSScriptRoot "$platform-synthetic.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $bigFont.Dispose()
}
