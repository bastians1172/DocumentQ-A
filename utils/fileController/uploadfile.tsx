'use client'
import React, { useState } from 'react'
import { supabase } from '../supabase';
import Image from 'next/image';

const Uploadfile = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            alert('Pilih file dulu!');
            return;
        }
    
        try {
            setIsLoading(true);
            setUploadProgress('Mengambil data user...');
            
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
    
            setUploadProgress('Mengupload file...');
            const formData = new FormData();
            formData.append("file", selectedFile);
            if (userData?.user?.id) {
                formData.append("user_id", userData.user.id);
            }
    
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
    
            if (!response.ok) {
                throw new Error('Upload gagal');
            }
    
            const result = await response.json();
            console.log('Upload berhasil:', result);
            setUploadProgress('Memverifikasi status upload...');

            setUploadProgress('Upload berhasil, memproses vector...');
    
            // Setelah upload selesai, mulai proses embedding
            await handleProcessVector(result.fileHash, userData.user.id);
            
            setUploadProgress('Proses selesai!');
            alert('File berhasil diupload dan diproses!');
        } catch (error) {
            console.error('Error:', error);
            alert('Upload gagal: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsLoading(false);
            setUploadProgress('');
        }
    };
    
    const handleProcessVector = async (fileHash: string, userId: string) => {
        try {
            console.log('Memulai proses vector dengan:', { fileHash, userId });
            setUploadProgress('Memproses vector...');
            
            const response = await fetch("/api/process-vector", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ fileHash, userId }),
            });
    
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Proses vector gagal');
            }
    
            const result = await response.json();
            console.log('Vector berhasil diproses:', result);
            setUploadProgress('Vector berhasil diproses!');
        } catch (error) {
            console.error('Error proses vector:', error);
            throw error; // Re-throw untuk ditangani di handleUpload
        }
    };
    
    return (
        <div className='flex flex-col items-center gap-4'>
            <div className='flex flex-row justify-center items-center gap-4'>
                <Image 
                    src="/upload.svg" 
                    alt="logo" 
                    width={34} 
                    height={34} 
                    className="border-2 border-gray-300 rounded-full p-2 bg-gray-100 cursor-pointer" 
                    onClick={() => document.getElementById('fileInput')?.click()} 
                />
                {selectedFile && (
                    <button 
                        onClick={handleUpload}
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Memproses...' : 'Upload File'}
                    </button>
                )}
                <input 
                    type="file" 
                    onChange={handleFileChange}
                    className="hidden" 
                    id="fileInput"
                    disabled={isLoading}
                />
            </div>
            {uploadProgress && (
                <p className="text-sm text-gray-600">{uploadProgress}</p>
            )}
            {selectedFile && (
                <p className="text-sm text-gray-500">File terpilih: {selectedFile.name}</p>
            )}
        </div>
    );
}

export default Uploadfile;