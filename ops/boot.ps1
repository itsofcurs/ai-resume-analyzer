$EvidenceDir = "certification_evidence"
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$LogFile = "$EvidenceDir/environment_boot.log"

echo "======================================" > $LogFile
echo "Phase 1: TalentAI Environment Boot Log" >> $LogFile
echo "Timestamp: $(Get-Date)" >> $LogFile
echo "======================================" >> $LogFile

echo "Starting Postgres and Redis..." | Tee-Object -Append -FilePath $LogFile
docker-compose -f docker-compose.yml up -d >> $LogFile 2>&1

echo "Starting Observability Stack..." | Tee-Object -Append -FilePath $LogFile
cd observability
docker-compose up -d >> "../$LogFile" 2>&1
cd ..

echo "Starting Python AI Service in background..." | Tee-Object -Append -FilePath $LogFile
cd ai-service
# Use python directly if venv is active, or assume global
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "-m uvicorn app:app --port 8000" -RedirectStandardOutput "../$EvidenceDir/ai_service_out.log" -RedirectStandardError "../$EvidenceDir/ai_service_err.log"
cd ..
echo "Python AI Service started." >> $LogFile

echo "Starting Node Backend in background..." | Tee-Object -Append -FilePath $LogFile
cd backend-node
Start-Process -NoNewWindow -FilePath "npx.cmd" -ArgumentList "ts-node src/server.ts" -RedirectStandardOutput "../$EvidenceDir/node_backend_out.log" -RedirectStandardError "../$EvidenceDir/node_backend_err.log"
cd ..
echo "Node Backend started." >> $LogFile

echo "Waiting for services to initialize..." | Tee-Object -Append -FilePath $LogFile
Start-Sleep -Seconds 10

echo "Boot Sequence Complete." | Tee-Object -Append -FilePath $LogFile
echo "Check $EvidenceDir/ai_service.log and node_backend.log for process streams." | Tee-Object -Append -FilePath $LogFile
