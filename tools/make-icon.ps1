# Generates resources/icon.png (512x512) for DSH Desktop.
Add-Type -AssemblyName System.Drawing
$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255,77,107,254), [System.Drawing.Color]::FromArgb(255,20,30,102), 55)
# rounded-rect path
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 96; $d = $r * 2
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
$path.AddArc(0, $size - $d, $d, $d, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)
# brand text
$font = New-Object System.Drawing.Font('Segoe UI', 150, [System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$white = [System.Drawing.Brushes]::White
$rectF = New-Object System.Drawing.RectangleF(0, 20, $size, ($size - 120))
$g.DrawString('DSH', $font, $white, $rectF, $sf)
# underline accent bar
$barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,124,147,255))
$g.FillRectangle($barBrush, 116, 356, 280, 22)
# terminal prompt glyph
$g.DrawRectangle([System.Drawing.Pens]::White, 176, 400, 160, 40)
$g.FillRectangle($white, 236, 414, 76, 12)
$g.Dispose()
$outDir = Join-Path $PSScriptRoot '..' | Resolve-Path
$bmp.Save((Join-Path $outDir 'resources\icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output 'icon written'
