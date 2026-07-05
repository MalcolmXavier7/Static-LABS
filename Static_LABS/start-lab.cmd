@echo off
rem Static LABS — always-on port manager + dashboard (http://localhost:3001)
cd /d "%~dp0port-manager"
npx tsx src/index.ts
