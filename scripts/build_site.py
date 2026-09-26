from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]; DIST=ROOT/'dist'
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
shutil.copy2(ROOT/'index.html',DIST/'index.html')
(DIST/'src').mkdir()
for asset in ('main.js', 'dashboard.js', 'phones.js', 'style.css'):
    shutil.copy2(ROOT/'src'/asset, DIST/'src'/asset)
(DIST/'catalog').mkdir()
shutil.copy2(ROOT/'catalog/index.html', DIST/'catalog/index.html')
(DIST/'phones').mkdir()
shutil.copy2(ROOT/'phones/index.html', DIST/'phones/index.html')
shutil.copytree(ROOT/'public/data',DIST/'data')
shutil.copytree(ROOT/'public/images',DIST/'images')
shutil.copy2(ROOT/'public/favicon.svg',DIST/'favicon.svg')
print('Built',DIST)
