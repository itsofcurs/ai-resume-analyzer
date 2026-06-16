import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const ENCRYPTION_KEY = process.env.EXPORT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

export const uploadExport = async (userId: string, filePath: string, filename: string): Promise<string> => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

  const fileBuffer = fs.readFileSync(filePath);
  const encrypted = Buffer.concat([iv, cipher.update(fileBuffer), cipher.final()]);

  const storagePath = `${userId}/${filename}.enc`;

  const { error } = await supabase.storage
    .from('gdpr-exports')
    .upload(storagePath, encrypted, { contentType: 'application/octet-stream' });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return storagePath;
};

export const generateSignedUrl = async (storagePath: string): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('gdpr-exports')
    .createSignedUrl(storagePath, 24 * 60 * 60); // 24 hours

  if (error || !data) {
    throw new Error('Failed to generate signed URL');
  }

  return data.signedUrl;
};

export const deleteExport = async (storagePath: string): Promise<void> => {
  const { error } = await supabase.storage
    .from('gdpr-exports')
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete export: ${error.message}`);
  }
};
