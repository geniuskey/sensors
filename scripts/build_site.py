from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]; DIST=ROOT/'dist'
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
shutil.copy2(ROOT/'index.html',DIST/'index.html')
(DIST/'src').mkdir(); shutil.copy2(ROOT/'src/main.js',DIST/'src/main.js'); shutil.copy2(ROOT/'src/style.css',DIST/'src/style.css')
shutil.copytree(ROOT/'public/data',DIST/'data')
print('Built',DIST)
