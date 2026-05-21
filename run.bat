@echo off
title FB Creative Uploader
cd /d "%~dp0"

REM 처음 실행이면 가상환경 자동 셋업
if not exist ".venv\Scripts\activate.bat" (
    echo [setup] Python 가상환경을 처음 만드는 중...
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo [error] python 명령을 찾을 수 없습니다. https://www.python.org/ 에서 Python 3.10+ 설치 후 다시 시도하세요.
        pause
        exit /b 1
    )
    call .venv\Scripts\activate.bat
    echo [setup] 패키지 설치 중...
    python -m pip install --upgrade pip --quiet
    python -m pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

REM secrets.toml 없으면 안내
if not exist ".streamlit\secrets.toml" (
    echo.
    echo [error] .streamlit\secrets.toml 이 없습니다.
    echo  .streamlit\secrets.toml.example 을 참고해 실제 값으로 채워주세요.
    pause
    exit /b 1
)

echo.
echo Streamlit 시작 중... 브라우저가 자동으로 열립니다.
echo 종료하려면 이 창에서 Ctrl+C 누르거나 창을 닫으세요.
echo.

streamlit run streamlit_app.py

REM 비정상 종료 시 메시지 확인 가능하게
pause
