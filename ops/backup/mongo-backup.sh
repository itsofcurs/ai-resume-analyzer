#!/bin/bash
# MongoDB Dump Script
MONGO_URI=${MONGO_URI:-'mongodb://localhost:27017/talentai'}
BACKUP_DIR=${BACKUP_DIR:-'/backups/mongo'}
DATE=$(date +%Y-%m-%d_%H-%M-%S)

mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR/$DATE"
echo "MongoDB backup completed at $BACKUP_DIR/$DATE"
