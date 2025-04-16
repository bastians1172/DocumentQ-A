import { supabaseAdmin } from "@/utils/supabaseAdmin";
import { NextResponse } from "next/server";

export async function DELETE(req: Request) {



    const { hash,userId } = await req.json();
    console.log("hash :",hash)
    console.log("userId :",userId)
    console.log("delete file")
    const { data: file } = await supabaseAdmin
    .from('uploaded_files')
    .delete()
    .eq('file_hash', hash)
    .eq('user_id', userId)
    console.log("deleting document")

    await supabaseAdmin
    .from('documents')
    .delete()
    .eq('metadata->>file_hash', hash);  // Pastikan pakai `->>` bukan `->`
    console.log("document deleted")
    await supabaseAdmin
      .storage
      .from('document-user')
      .remove([hash + userId])


    return NextResponse.json({ file })
}