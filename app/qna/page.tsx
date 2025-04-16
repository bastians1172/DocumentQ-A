'use client';

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/utils/supabase";
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {X, FileText } from "lucide-react";
import Image from "next/image";
import {DarkModeToggle} from '@/components/darkmode/darkmode'



interface Message {
  sender: "user" | "ai";
  text: string;
  context?: {
    pageContent: string;
    metadata: {
      id: number;
      user_id: string;
      file_hash: string;
    };
  }[];
}

interface FileItem {
  id: string;
  file_name: string;
  file_hash: string;
  created_at: string;
  user_id: string;
}


export default function DocumentChat() {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { sender: "ai", text: "Hello! I'm your AI assistant. You can ask me questions about your documents or have a general conversation." }
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [showFiles, setShowFiles] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [expandedContext, setExpandedContext] = useState<Record<string, boolean>>({});
  const captchaRef = useRef<HCaptcha>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isCaptchaVerifying, setIsCaptchaVerifying] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [isDelete, setIsDelete] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle captcha
  const handleCaptchaLoad = () => {
    setCaptchaError(null);
    setIsCaptchaVerifying(false);
  };

  const handleCaptchaError = () => {
    console.error('hCaptcha Error:');
    setCaptchaError('Failed to load captcha. Please try refreshing the page.');
    setIsCaptchaVerifying(false);
  };

  const handleCaptchaExpired = () => {
    setCaptchaToken(undefined);
    setCaptchaError('Captcha expired. Please verify again.');
    setIsCaptchaVerifying(false);
    captchaRef.current?.resetCaptcha();
  };

  const handleCaptchaVerify = (token: string) => {
    setIsCaptchaVerifying(true);
    setCaptchaToken(token);
    setCaptchaError(null);
  };

  // Handle login
  useEffect(() => {
    async function signIn() {
      if (!captchaToken) return;

      try {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session) {
          console.log('Sudah login:', session.session.user);
          const { data } = await supabase.auth.getUser();
          setUserId(data.user?.id || "");
          return;
        }

        const {  error } = await supabase.auth.signInAnonymously({
          options: {
            captchaToken: captchaToken
          }
        });

        if (error) {
          console.error('Login gagal:', error.message);
          setError(error.message);
          setCaptchaToken(undefined);
          captchaRef.current?.resetCaptcha();
        } else {
          const { data } = await supabase.auth.getUser();
          setUserId(data.user?.id || "");
          setError(null);
        }
      } catch (error) {
        console.error('Error during login:', error);
        setError('An unexpected error occurred. Please try again.');
        setCaptchaToken(undefined);
        captchaRef.current?.resetCaptcha();
      }
    }

    signIn();
  }, [captchaToken]);

  // Handle file operations
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first!');
      return;
    }

    try {
      setIsLoading(true);
      setUploadProgress('Getting user data...');
      
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      setUploadProgress('Uploading file...');
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
        const errorData = await response.json();
        console.log("error : ",errorData)
        throw new Error(errorData.error || 'upload failed');
      }

      const result = await response.json();
      if(result.message === 'The resource already exists' ){
        setUploadProgress('File already exists')
        return
      }
      console.log('Upload successful:', result);
      setUploadProgress('Verifying upload status...');

      setUploadProgress('Upload successful, processing vector...');
      await handleProcessVector(result.fileHash, userData.user.id);
      
      setUploadProgress('Process completed!');
      fetchFiles(); // Refresh file list
    } catch (error) {
      console.error('Error:', error);
      setUploadProgress('Upload failed')
    } finally {
        setTimeout(() => {
            setIsLoading(false);
            setUploadProgress('');
            setSelectedFile(null);
        }, 3000);
    }
  };

  const handleProcessVector = async (fileHash: string, userId: string) => {
    try {
      console.log('Starting vector process with:', { fileHash, userId });
      setUploadProgress('Processing file...');
      
      const response = await fetch("/api/process-vector", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fileHash, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Vector process failed');
      }

      const result = await response.json();
      console.log('Vector processed successfully:', result);
      setUploadProgress('File uploaded');
    } catch (error) {
      console.error('Error in vector process:', error);
      throw error;
    }
  };

  const fetchFiles = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await fetch('/api/getUserFile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      const data = await response.json();
      setFiles(data.file || []);
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
    }
  }, [userId]);

  // Auto-refresh file list
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDeleteFile = async (hash: string) => {
    setIsDelete(true)
    try {
      const response = await fetch('/api/deleteFile', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hash, userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      setFiles(files.filter(file => file.file_hash !== hash));
      setShowMenu(null);
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setIsDelete(false)
    }
  };

  // Handle chat messages
  const handleSend = async () => {
    if (!input.trim() || !captchaToken) return;
    
    try {
      setAiLoading(true);
      setIsLoading(true);
      setError(null);
      
      // Add user message
      setMessages(prev => [...prev, { sender: "user", text: input }]);
      
      // Send to API
      const response = await fetch('/api/qna', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          question: input,
          captchaToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Something went wrong');
      }

      const data = await response.json();
      
      // Add AI response with context
      setMessages(prev => [...prev, { 
        sender: "ai", 
        text: data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
        context: data.context || []
      }]);
      
      setInput("");

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Don't reset captcha on error
    } finally {
      setAiLoading(false);
      setIsLoading(false);
    }
  };

  // Add auto-scroll effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleContext = (messageIndex: number, contextIndex: number) => {
    const key = `${messageIndex}-${contextIndex}`;
    setExpandedContext(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!mounted) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
{captchaToken === undefined && (
  <motion.div 
    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <motion.div 
      className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full mx-4 flex flex-col items-center justify-center"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
    >
      {captchaError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg w-full text-center">
          {captchaError}
        </div>
      )}

      {isCaptchaVerifying && (
        <div className="mb-4 flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-sm text-gray-700">Verifying...</span>
        </div>
      )}

      <HCaptcha
        ref={captchaRef}
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || ''}
        onLoad={handleCaptchaLoad}
        onError={handleCaptchaError}
        onExpire={handleCaptchaExpired}
        onVerify={handleCaptchaVerify}
      />
    </motion.div>
  </motion.div>
)}

      {/* Mobile Navigation */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 shadow-md">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FileText className="h-6 w-6 text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center space-x-4">
            <DarkModeToggle />
          </div>
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:flex md:flex-col md:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Document Q&A</h1>
          <div className="flex items-center space-x-2">
            <DarkModeToggle />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowFiles(!showFiles)}
              className="hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <FileText className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </Button>
          </div>
        </div>
        {/* ... rest of the sidebar content ... */}
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col mt-16 md:mt-0">
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          <AnimatePresence>
            {messages.map((msg, index) => (
              <motion.div 
                key={`message-${index}`} 
                className={`mb-3 ${msg.sender === "user" ? "text-right" : "text-left"}`}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <Card className={`${
                  msg.sender === "user" 
                    ? "ml-auto bg-blue-600 text-white dark:bg-blue-700" 
                    : "mr-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                } inline-block max-w-[80vw] md:max-w-[40vw]`}> 
                  <CardContent className="p-3 whitespace-pre-wrap break-words">
                    {msg.text}
                    {msg.sender === "ai" && msg.context && msg.context.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sources:</p>
                        <div className="space-y-1">
                          {msg.context.map((source, idx) => {
                            const key = `${index}-${idx}`;
                            const isExpanded = expandedContext[key];
                            return (
                              <div 
                                key={idx} 
                                className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                onClick={() => toggleContext(index, idx)}
                              >
                                <p className="font-medium">Document ID: {source.metadata.id}</p>
                                <p className={`mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>
                                  {source.pageContent}
                                </p>
                                <p className="text-blue-500 dark:text-blue-400 text-xs mt-1">
                                  {isExpanded ? 'Show less' : 'Show more'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {aiLoading && (
              <motion.div 
                key="loading-indicator"
                className="mb-4 text-left"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="mr-auto inline-block h-fit bg-gray-200 dark:bg-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">AI is generating response...</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </AnimatePresence>
          {error && (
            <motion.div 
              key="error-message"
              className="text-red-500 dark:text-red-400 text-center p-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {error}
            </motion.div>
          )}
        </div>
        <div className="p-4 border-t dark:border-gray-700 flex items-center gap-2 ">
          <Input
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow h-12 px-4 py-2 text-base bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSend();
              }
            }}
          />
          <Button 
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !captchaToken}
            className="h-12 px-6 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
          >
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </div>
      </main>

      {/* Files Sidebar - Mobile & Desktop */}
      <motion.aside 
        className={`fixed md:static md:w-72 bg-white dark:bg-gray-800 p-4 border-l dark:border-gray-700 shadow-inner h-full z-30 ${
          showFiles ? 'translate-x-0' : 'translate-x-full'
        } md:translate-x-0 transition-transform duration-300 right-0`}
      >
        <div className="md:hidden flex justify-between items-center mb-4">
          <p className="font-semibold text-gray-900 dark:text-white">Documents</p>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowFiles(false)}
            className="text-gray-600 dark:text-gray-300"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* File Upload Section */}
        <div className="mb-4">
          <div 
            className="border-dashed border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/20');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/20');
            }}
            onDrop={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/20');
              
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                const fileList = dataTransfer.files;
                handleFileChange({ target: { files: fileList } } as React.ChangeEvent<HTMLInputElement>);
              }
            }}
          >
            <input
              type="file"
              className="hidden"
              id="fileUpload"
              onChange={handleFileChange}
            />
            <label htmlFor="fileUpload" className="flex flex-col items-center gap-3 cursor-pointer">
              <div className="relative">
                <Image 
                  src="/upload.svg" 
                  alt="upload" 
                  height={24}
                  width={24}
                  className="object-contain dark:invert"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Drag and drop your documents here</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">or click to browse</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">PDF, TXT, or Office files</p>
                <small className="text-xs text-gray-500 dark:text-gray-400">
                  Maximum supported file size is <span className="text-red-400">4MB</span>
                </small>
              </div>
            </label>
          </div>
          {selectedFile && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex flex-col gap-2 items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                  onClick={handleUpload}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading...</span>
                    </div>
                  ) : "Upload File"}
                </Button>
              </div>
              {uploadProgress && (
                <div className="mt-3">
                  <div className="h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                      style={{ 
                        width: uploadProgress.includes('completed') ? '100%' : 
                               uploadProgress.includes('failed') ? '0%' : '50%' 
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{uploadProgress}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* File List */}
        <ul className="mt-4 space-y-2">
          <AnimatePresence>
            {files.map((file) => (
              <motion.li 
                key={file.id} 
                className="flex items-center justify-between border dark:border-gray-700 p-2 rounded bg-white dark:bg-gray-800"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{file.file_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Uploaded: {new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="relative">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setShowMenu(showMenu === file.id ? null : file.id)}
                    className="text-gray-500 dark:text-gray-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </Button>
                  
                  {showMenu === file.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 border dark:border-gray-700">
                      <div className="py-1">
                        {!isDelete && (
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleDeleteFile(file.file_hash)}
                          >
                            Delete File
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </motion.aside>

      {/* Overlay for mobile sidebar */}
      {showFiles && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setShowFiles(false)}
        />
      )}
    </div>
  );
}