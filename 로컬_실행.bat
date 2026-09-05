@echo off
chcp 65001 >nul
REM 광고주 공유용 대시보드 — 로컬 배포 실행
REM   1) 정산 백엔드(:8000)  2) 이 앱의 정적 서버(:3100, /api 는 백엔드로 프록시)
REM 배포(k8s)에서는 nginx 가 하는 일을 로컬에서 serve_local.py 가 대신한다.

REM ── 경로 (환경에 맞게 고치세요)
set "BACKEND=C:\lgwork\_advwt\backend"
set "LGE_WORK=C:\lgwork"
set "LGE_STATE=C:\lgwork\adv_state"
REM LGE_PROJECT 은 인보이스 PDF 폴더(invoice\N월\*.pdf)의 상위 폴더다.
REM 정산 탭의 [v] 인보이스 보기가 이 경로에서 PDF 를 읽는다 - 틀리면 버튼이 안 뜬다.
set "LGE_PROJECT=G:\.shortcut-targets-by-id\1htTuc5GPR8VpdA70hRPhsSLb9HTffUy8\-----------------------W1--------------------------\CS1A\LG전자 냉장고(LGE HS NPI)\정산 자동화"

echo [1/2] 정산 백엔드 :8000
start "LGE 정산 백엔드" cmd /k "cd /d %BACKEND% && set LGE_WORK=%LGE_WORK%&& set LGE_STATE=%LGE_STATE%&& set LGE_PROJECT=%LGE_PROJECT%&& python -m uvicorn main:app --host 0.0.0.0 --port 8000"

echo      기동 대기...
timeout /t 6 /nobreak >nul

echo [2/2] 대시보드 :3100
start "LGE 광고주 대시보드" cmd /k "cd /d %~dp0 && python serve_local.py"

timeout /t 3 /nobreak >nul
start http://localhost:3100
echo.
echo 열린 창 두 개를 닫으면 서버가 내려갑니다.
