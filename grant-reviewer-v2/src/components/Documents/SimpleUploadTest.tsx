import React, { useState } from 'react';

export function SimpleUploadTest() {
  const [files, setFiles] = useState<FileList | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🚀 SIMPLE TEST: File input changed!');
    console.log('🚀 SIMPLE TEST: Files:', e.target.files);
    setFiles(e.target.files);
  };

  const handleClick = () => {
    console.log('🚀 SIMPLE TEST: Upload clicked with files:', files);
  };

  const handleInputClick = () => {
    console.log('🚀 SIMPLE TEST: File input CLICKED!');
  };

  const handleFocus = () => {
    console.log('🚀 SIMPLE TEST: File input FOCUSED!');
  };

  const handleTestClick = () => {
    console.log('🚀 SIMPLE TEST: Test button clicked - basic JS working!');
    console.log('🚀 SIMPLE TEST: Current window.location:', window.location.href);
    console.log('🚀 SIMPLE TEST: Any errors in console?');
  };

  return (
    <div style={{ padding: '20px', border: '2px solid red', margin: '10px' }}>
      <h3>Simple Upload Test</h3>
      <button onClick={handleTestClick} style={{ marginBottom: '10px', padding: '5px' }}>
        Test Basic JS (Check Console)
      </button>
      <br />
      <input 
        type="file" 
        onChange={handleChange}
        onClick={handleInputClick}
        onFocus={handleFocus}
        multiple
        style={{ marginBottom: '10px' }}
      />
      <p>Files selected: {files ? files.length : 0}</p>
      <button onClick={handleClick} disabled={!files}>
        Test Upload
      </button>
    </div>
  );
}
