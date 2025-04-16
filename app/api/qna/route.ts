// pages/api/qna/index.ts
'use server'
import { ChatGroq } from "@langchain/groq";

import { NextResponse } from 'next/server';
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { supabase } from '@/utils/supabase';
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createRetrievalChain } from "langchain/chains/retrieval";
export async function POST(req: Request) {
  const { userId, question } = await req.json();
  console.log(userId, question)
  const prompt = ChatPromptTemplate.fromTemplate(`
    Jawablah pertanyaan hanya berdasarkan konteks yang diberikan.
    Berikan jawaban seakurat mungkin sesuai dengan pertanyaan.
    
    <context>
    {context}
    </context>
    
    Pertanyaan: {input}
    
    Catatan:
    Jawablah menggunakan bahasa yang sesuai dengan konteks jika user tidak memberikan arahan bahasa secara spesifik.
    `);
    
    
  if (!userId || !question) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }

  // Pastikan file_id milik user yang benar
  const { data: file, error: fileError } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('user_id', userId)
    console.log("file :",file)



  if (fileError || file.length === 0) {
    console.log("file error")
    return NextResponse.json({ error: "No file found, please upload file first" }, { status: 404 });
  }
  console.log("embeddings")
  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: "nomic-ai/nomic-embed-text-v1",
  });
  // Siapkan vector store
  console.log("vector store")
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabase,
    tableName: "documents",
    queryName: "match_documents",
    filter: { user_id: userId }
  });
  
  // Cari berdasarkan question
  console.log("llm")
  const llm = new ChatGroq({
    model: "deepseek-r1-distill-llama-70b",
    apiKey: process.env.GROQ_API_KEY,
    timeout: 10000,
    maxRetries: 3
  });
console.log("retriever")
const retriever = vectorStore.asRetriever();
console.log("document chain")
const documentChain = await createStuffDocumentsChain({
  llm: llm,
  prompt,
});
console.log("retrieval chain")
const retrievalChain = await createRetrievalChain({
  combineDocsChain: documentChain,
  retriever,
});
const result = await retrievalChain.invoke({input: question})
// Format the response properly
return NextResponse.json({answer: result.answer, context: result.context});
}
