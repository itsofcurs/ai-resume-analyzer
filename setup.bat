@echo off
echo ===============================================
echo   Smart Resume Skill Extractor - Setup
echo ===============================================
echo.

echo [1/4] Installing Python dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed. Make sure Python and pip are installed.
    pause
    exit /b 1
)

echo.
echo [2/4] Downloading spaCy English model...
python -m spacy download en_core_web_sm
if %errorlevel% neq 0 (
    echo WARNING: spaCy model download failed. The app will use a blank model.
)

echo.
echo [3/4] Downloading NLTK data...
python -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('punkt_tab', quiet=True); nltk.download('stopwords', quiet=True); print('NLTK data downloaded.')"

echo.
echo [4/4] Creating upload directory...
if not exist "static\uploads" mkdir "static\uploads"

echo.
echo ===============================================
echo   Setup Complete!
echo   Run the app with: python app.py
echo   Then open: http://127.0.0.1:5000
echo ===============================================
pause
