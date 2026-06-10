#!/bin/bash
# PostgreSQL Backup Script
PG_URL=${DATABASE_URL:-'postgresql://user:password@localhost:5432/talentai'}
BACKUP_DIR=${BACKUP_DIR:-'/backups/postgres'}
DATE=$(date +%Y-%m-%d_%H-%M-%S)

mkdir -p $BACKUP_DIR
pg_dump $PG_URL > "$BACKUP_DIR/talentai_$DATE.sql"
echo "PostgreSQL backup completed at $BACKUP_DIR/talentai_$DATE.sql"
