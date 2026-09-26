from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]; DIST=ROOT/'dist'
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
shutil.copy2(ROOT/'index.html',DIST/'index.html')
(DIST/'src').mkdir()
for asset in ('main.js', 'dashboard.js', 'style.css'):
    shutil.copy2(ROOT/'src'/asset, DIST/'src'/asset)
(DIST/'catalog').mkdir()
shutil.copy2(ROOT/'catalog/index.html', DIST/'catalog/index.html')
shutil.copytree(ROOT/'public/data',DIST/'data')
print('Built',DIST)
