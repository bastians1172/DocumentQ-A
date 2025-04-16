// /pages/api/upload-file.ts
'use server';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import crypto from 'crypto';

// Constants for file size limits (in bytes)
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

function generateHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function POST(req: Request) {
  console.log('=== Mulai proses upload ===');
  
  const data = await req.formData();
  const file = data.get('file') as File;
  const userId = data.get('user_id') as string;

  console.log('Data yang diterima:', {
    fileName: file?.name,
    fileSize: file?.size,
    fileType: file?.type,
    userId: userId
  });

  if (!file || !userId) {
    console.error('Data tidak lengkap:', { file: !!file, userId: !!userId });
    return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
  }

  // Validasi ukuran file
  if (file.size > MAX_FILE_SIZE) {
    console.error('Ukuran file melebihi batas:', file.size);
    return NextResponse.json({ 
      error: `Ukuran file melebihi batas maksimal (${MAX_FILE_SIZE / (1024 * 1024)}MB).` 
    }, { status: 400 });
  }

  // Validasi ekstensi file
  const allowedExtensions = [
    '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
  ];
  const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!allowedExtensions.includes(fileExtension)) {
    console.error('Ekstensi file tidak didukung:', fileExtension);
    return NextResponse.json({ 
      error: 'Format file tidak didukung. Hanya file PDF, TXT, dan Microsoft Office (DOC, DOCX, XLS, XLSX, PPT, PPTX) yang diperbolehkan.' 
    }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = generateHash(buffer);

  console.log('File hash generated:', fileHash);

  // Cek total ukuran file yang sudah diupload
  const { data: userFiles, error: countError } = await supabaseAdmin
    .from('uploaded_files')
    .select('*')
    .eq('user_id', userId);

  if (countError) {
    console.error('Error saat mengecek total ukuran file:', countError);
    return NextResponse.json({ error: 'Gagal memeriksa total ukuran file.' }, { status: 500 });
  }



  // Check file upload limit
  if (userFiles && userFiles.length >= 5) {
    return NextResponse.json(
      { error: "You have reached the upload limit (5 files)" },
      { status: 400 }
    );
  }

  console.log('Mengecek file yang sudah ada...');
  const { data: existingFile, error: existingFileError } = await supabaseAdmin
    .from('uploaded_files')
    .select('*')
    .eq('file_hash', fileHash)
    .eq('user_id', userId)
    .single();

  if (existingFileError) {
    console.error('Error saat mengecek file yang ada:', existingFileError);
  }

  if (existingFile) {
    console.log('File sudah ada di database:', existingFile);
    return NextResponse.json({ 
      status: 'File sudah ada di database.', 
      fileId: existingFile.id, 
      fileHash 
    });  }

  try {
    console.log('Memulai upload ke storage...');
    // Upload file ke storage bucket
    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from('document-user')
      .upload(fileHash + userId, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      if(uploadError.message === 'The resource already exists') {
        console.log('File sudah ada di storage');
        return NextResponse.json({ error: 'File sudah ada.' }, { status: 500 });
      }
      console.error('Error uploading to storage:', {
        error: uploadError,
        message: uploadError.message
      });
      return NextResponse.json({ error: 'Gagal mengupload file ke storage.' }, { status: 500 });
    }

    console.log('File berhasil diupload ke storage:', {
      path: uploadData.path,
      id: uploadData.id,
      fullPath: uploadData.fullPath
    });

    // Verifikasi file ada di storage
    console.log('Memverifikasi file di storage...');
    const { data: verifyData, error: verifyError } = await supabaseAdmin
      .storage
      .from('document-user')
      .exists(fileHash + userId);

    console.log('Hasil verifikasi storage:', {
      verifyData,
      verifyError,
      fileExists: verifyData
    });

    if (verifyError || !verifyData) {
      console.error('File verification failed:', {
        error: verifyError,
        verifyData,
        fileExists: verifyData
      });
      return NextResponse.json({ error: 'Gagal memverifikasi file di storage.' }, { status: 500 });
    }

    console.log('File berhasil diverifikasi di storage');

    // Simpan metadata ke database
    console.log('Menyimpan metadata ke database...');
    const { data: newFile, error: dbError } = await supabaseAdmin
      .from('uploaded_files')
      .insert([{ 
        file_name: file.name, 
        file_hash: fileHash, 
        user_id: userId,
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Error saving to database:', {
        error: dbError,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint
      });
      
      console.log('Menghapus file dari storage karena gagal menyimpan metadata...');
      const { error: removeError } = await supabaseAdmin.storage.from('document-user').remove([fileHash + userId]);
      if (removeError) {
        console.error('Error saat menghapus file dari storage:', removeError);
      }
      
      return NextResponse.json({ error: 'Gagal menyimpan metadata file.' }, { status: 500 });
    }

    console.log('Metadata berhasil disimpan:', newFile);
    console.log('=== Proses upload selesai ===');
    
    return NextResponse.json({ 
      status: 'Upload sukses, siap diproses embedding.', 
      fileId: newFile.id, 
      fileHash 
    });

  } catch (error) {
    console.error('Unexpected error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengupload file.' }, { status: 500 });
  }
}
