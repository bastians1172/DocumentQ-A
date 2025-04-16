import { supabase } from "@/utils/supabase"
import { NextResponse } from "next/server"
export async function POST(req: Request) {



const { userId } = await req.json();
const { data: file } = await supabase
.from('uploaded_files')
.select('*')
.eq('user_id', userId)
console.log("file user :",file)
return NextResponse.json({ file })
}