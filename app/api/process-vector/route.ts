'use server';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { join } from 'path';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';

let cachedEmbedding: HuggingFaceTransformersEmbeddings | null = null;

function getEmbeddings() {
  if (!cachedEmbedding) {
    console.log('Initializing HuggingFace embeddings model...');
    cachedEmbedding = new HuggingFaceTransformersEmbeddings({
      model: 'nomic-ai/nomic-embed-text-v1',
    });
    console.log('Embeddings model initialized successfully');
  }
  return cachedEmbedding;
}

async function getFileLoader(fileData: Blob, fileType: string) {
  // Create temp directory if it doesn't exist
  const tempDir = join(process.cwd(), 'temp');
  try {
    mkdirSync(tempDir, { recursive: true });
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }

  // Create a temporary file path
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileType.split('/')[1]}`;
  const tempFilePath = join(tempDir, fileName);
  
  // Convert Blob to Buffer and write to temporary file
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Write buffer to temporary file
  writeFileSync(tempFilePath, buffer);
  
  let loader;
  switch (fileType) {
    case 'application/pdf':
      loader = new PDFLoader(tempFilePath);
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      loader = new DocxLoader(tempFilePath);
      break;
    case 'text/plain':
      loader = new TextLoader(tempFilePath);
      break;
    default:
      // Clean up file if type not supported
      try {
        unlinkSync(tempFilePath);
      } catch (error) {
        console.error('Error deleting temporary file:', error);
      }
      throw new Error(`Unsupported file type: ${fileType}`);
  }

  // Return loader and file path for cleanup
  return { loader, tempFilePath };
}

export async function POST(req: Request) {
  console.log('Starting vector processing request...');
  const { fileHash, userId } = await req.json();
  console.log('Received request with:', { fileHash, userId });

  if (!fileHash || !userId) {
    console.error('Missing required parameters:', { fileHash, userId });
    return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
  }

  // Check if vectors already exist for this file
  console.log('Checking for existing vectors...');
  const { data: existingVectors, error: checkError } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('metadata->file_hash', fileHash)
    .eq('metadata->user_id', userId)
    .limit(1);

  if (checkError) {
    console.error('Error checking existing vectors:', checkError);
  }

  if (existingVectors && existingVectors.length > 0) {
    console.log('Vectors already exist for this file');
    return NextResponse.json({ 
      status: 'Vektor sudah ada di database.',
      details: {
        fileHash,
        userId,
        existing: true
      }
    });
  }

  // Download file from Supabase storage
  console.log('Fetching file from storage with hash:', fileHash);
  const { data: fileData, error } = await supabaseAdmin
    .storage
    .from('document-user')
    .download(fileHash + userId);

  if (error || !fileData) {
    console.error('Error fetching file from storage:', error);
    return NextResponse.json({ error: 'File tidak ditemukan di storage.' }, { status: 404 });
  }
  console.log('File successfully fetched from storage');

  let tempFilePath: string | null = null;
  try {
    // Get appropriate loader based on file type
    console.log('Initializing loader for file type:', fileData.type);
    const { loader, tempFilePath: filePath } = await getFileLoader(fileData, fileData.type);
    tempFilePath = filePath;
    
    // Load documents
    console.log('Loading documents...');
    const docs = await loader.load();
    console.log('Documents loaded successfully');

    // Split documents into chunks
    console.log('Splitting documents into chunks...');
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitDocuments(docs);
    console.log('Documents split into', chunks.length, 'chunks');

    // Initialize embeddings and vector store
    console.log('Getting embeddings model...');
    const embeddings = getEmbeddings();

    console.log('Creating vector store instance...');
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabaseAdmin,
      tableName: 'documents',
      queryName: 'match_documents',
    });

    // Process chunks in batches
    const batchSize = 30;
    console.log('Processing chunks in batches of', batchSize, '...');
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batchChunks.length} chunks)...`);

      // Add metadata to each chunk
      const batchDocuments = batchChunks.map((chunk, index) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          id: i + index + 1,
          file_hash: fileHash,
          user_id: userId,
        },
      }));
      console.log('batchDocuments ')
      // Store batch in vector store
      try {
        await vectorStore.addDocuments(batchDocuments);
        console.log(`Batch ${Math.floor(i / batchSize) + 1} successfully stored`);
      } catch (error) {
        console.error(`Error storing batch ${Math.floor(i / batchSize) + 1}:`, error);
        return NextResponse.json({ error: 'Gagal menyimpan batch vektor.' }, { status: 500 });
      }
    }

    console.log('Vector processing completed successfully');
    return NextResponse.json({ 
      status: 'Vektor berhasil diproses dan disimpan!',
      details: {
        chunksProcessed: chunks.length,
        fileHash,
        userId
      }
    });
  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json({ error: 'Gagal memproses file.' }, { status: 500 });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath);
      } catch (error) {
        console.error('Error deleting temporary file:', error);
      }
    }
  }
}