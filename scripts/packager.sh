rm -rf diffs slugs
npx electron-packager . --overwrite --platform=darwin --arch=x64 --icon=app-icon.icns --prune=true --out=builds