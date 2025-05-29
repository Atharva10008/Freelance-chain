import axios from 'axios';

// Assuming your backend has an endpoint like /api/upload-to-ipfs that handles IPFS uploads
// This function sends a file to the backend and expects the IPFS hash in the response
export const uploadToIPFS = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    // Replace with your actual backend IPFS upload endpoint
    const uploadEndpoint = 'http://localhost:5000/api/upload-to-ipfs'; // Example endpoint

    const response = await axios.post(uploadEndpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    // Assuming your backend returns the IPFS hash in response.data.hash
    if (response.data && response.data.hash) {
      return response.data.hash;
    } else {
      throw new Error('IPFS upload failed: Invalid response from backend');
    }
  } catch (error) {
    console.error('Error uploading file to IPFS via backend:', error);
    // More detailed error handling based on backend response structure
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(`IPFS upload failed: ${error.response.data.error}`);
    } else if (error.request) {
        // The request was made but no response was received
         throw new Error('IPFS upload failed: No response from backend. Make sure the backend is running and the endpoint is correct.');
    } 
    else {
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }
}; 