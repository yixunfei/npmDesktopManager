@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if /I "%~1"=="all" goto build_all
if /I "%~1"=="win" goto build_all
if /I "%~1"=="installer" goto build_installer
if /I "%~1"=="install" goto build_installer
if /I "%~1"=="portable" goto build_portable
if /I "%~1"=="app" goto build_app
if /I "%~1"=="build" goto build_app
if /I "%~1"=="release" goto open_release
if /I "%~1"=="help" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--help" goto usage
if not "%~1"=="" goto unknown_arg

:menu
cls
echo ==================================================
echo npmDesktopManager Packaging
echo ==================================================
echo.
echo  1. Windows all packages     ^(installer + portable^)
echo  2. Windows installer only   ^(NSIS setup exe^)
echo  3. Windows portable only    ^(portable exe^)
echo  4. App build only           ^(dist + dist-electron^)
echo  5. Open release folder
echo  0. Exit
echo.
set /p choice=Select an option: 

if "%choice%"=="1" goto build_all
if "%choice%"=="2" goto build_installer
if "%choice%"=="3" goto build_portable
if "%choice%"=="4" goto build_app
if "%choice%"=="5" goto open_release
if "%choice%"=="0" goto end

echo.
echo Invalid option.
pause
goto menu

:build_all
call :run_npm build:win "Windows all packages"
goto finish

:build_installer
call :run_npm build:win-installer "Windows installer"
goto finish

:build_portable
call :run_npm build:win-portable "Windows portable package"
goto finish

:build_app
call :run_npm build "Application build"
goto finish

:open_release
if exist "%~dp0release" (
  start "" "%~dp0release"
) else (
  echo Release folder does not exist yet.
)
goto finish

:run_npm
echo.
echo ==================================================
echo %~2
echo ==================================================
echo.
call npm run %~1
exit /b %errorlevel%

:finish
if errorlevel 1 goto failed
echo.
echo Done.
if exist "%~dp0release" echo Output folder: "%~dp0release"
goto wait_if_interactive

:failed
echo.
echo Build failed. See the log above for details.
goto wait_if_interactive

:wait_if_interactive
if "%~1"=="" pause
goto end

:unknown_arg
echo Unknown option: %~1
echo.
goto usage

:usage
echo Usage:
echo   build.bat             Show interactive menu
echo   build.bat all         Build installer and portable packages
echo   build.bat installer   Build installer only
echo   build.bat portable    Build portable package only
echo   build.bat app         Build app files only
echo   build.bat release     Open release folder
goto end

:end
endlocal
