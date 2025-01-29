import React, { useState } from 'react';

export default function Upload() {

    const [file, setFile] = useState<File | null>(null);
      
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files? e.target.files[0] : null;
        if (uploadedFile) {
          setFile(uploadedFile);
        }
    };
      
    const handleSubmit = () => {
        // Here you can handle file upload logic (e.g., sending to server)
        if (file) {
          console.log('File ready to upload:', file);
        } else {
          console.log('No file selected');
        }
    };

    return (
        <div className="uploadMain">
            <h1>Upload Page test</h1>

            <div className="uploadFile">
                <div>
                    <input type="file" onChange={handleFileChange} />
                    {file && (
                        <div>
                            <p>Selected file: {file.name}</p>
                        </div>
                    )}
                    <button onClick={handleSubmit}>Upload</button>
                </div>
            </div>

        </div>



    );

}