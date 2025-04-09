import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Main application component
function FileTransferClient() {
  // State variables
  const [server, setServer] = useState('localhost');
  const [port, setPort] = useState('12345');
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [status, setStatus] = useState('');
  const [outputFilename, setOutputFilename] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentOperation, setCurrentOperation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
/*

## Client Setup

### Prerequisites
- Node.js (v14 or newer)
- npm (v6 or newer)

### Installation

1. Create a new React app:
```
npx create-react-app file-transfer-client
cd file-transfer-client
```

2. Replace the content of `src/index.js` with the content from the "File Transfer Client" artifact.

3. Start the client:
```
npm start
```

The client will open in your browser at `http://localhost:3000`.

## Using the Client

1. Enter the server address (default: localhost) and port (default: 12345) in the connection panel.
2. Click "Connect" to establish a connection to the server.
3. The file list will show all available files on the server.
4. Select files by clicking on them (or use "Select All").
5. Click "Get Selected Files" to download the selected files, or "Get All Files" to download all files.
6. Enter a filename for the archive when prompted.
7. The downloaded archive will be saved to your downloads folder.

## Protocol Details

The client and server communicate using a simple text-based protocol:

- `LIST`: Returns a list of available files, one per line.
- `GETALL`: Returns all files as a tar.gz archive.
- `GET <filenames>`: Returns specified files as a tar.gz archive.
- `QUIT`: Disconnects from the server.
*/
  
  // Connect to server
  const connect = async () => {
    if (!server || !port) {
      setStatus('Please enter server address and port');
      return;
    }

    setIsLoading(true);
    try {
      // Test connection by sending LIST command
      const response = await sendCommand('LIST');
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Update UI
      setConnected(true);
      setFiles(parseFileList(response.data));
      setStatus('Connected successfully');
    } catch (error) {
      setStatus(`Connection failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect from server
  const disconnect = async () => {
    try {
      await sendCommand('QUIT');
    } catch (error) {
      console.error('Error sending QUIT command:', error);
    }
    
    setConnected(false);
    setFiles([]);
    setSelectedFiles([]);
    setStatus('Disconnected');
  };

  // Send command to server
  const sendCommand = async (command) => {
    try {
      const response = await fetch(`http://${server}:${port}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: command,
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      // Check if response is a tar.gz file or text
      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/gzip')) {
        return {
          type: 'file',
          data: await response.blob(),
        };
      } else {
        return {
          type: 'text',
          data: await response.text(),
        };
      }
    } catch (error) {
      console.error('Error sending command:', error);
      return { error: error.message };
    }
  };

  // Parse file list from server response
  const parseFileList = (responseText) => {
    if (!responseText) return [];
    return responseText.trim().split('\n').filter(line => line.trim() !== '');
  };

  // Refresh file list
  const refreshFileList = async () => {
    if (!connected) return;
    
    setIsLoading(true);
    try {
      const response = await sendCommand('LIST');
      if (response.error) {
        throw new Error(response.error);
      }
      setFiles(parseFileList(response.data));
      setStatus('File list refreshed');
    } catch (error) {
      setStatus(`Failed to refresh files: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle GET command
  const handleGetFiles = async () => {
    if (selectedFiles.length === 0) {
      setStatus('Please select at least one file');
      return;
    }

    setCurrentOperation('GET');
    setShowSaveDialog(true);
  };

  // Handle GETALL command
  const handleGetAllFiles = async () => {
    setCurrentOperation('GETALL');
    setShowSaveDialog(true);
  };

  // Execute file download after filename is provided
  const executeFileDownload = async () => {
    if (!outputFilename) {
      setStatus('Please enter a filename');
      return;
    }

    // Ensure filename has .tar.gz extension
    let filename = outputFilename;
    if (!filename.endsWith('.tar.gz')) {
      filename += '.tar.gz';
    }

    setIsLoading(true);
    try {
      let command, response;
      
      if (currentOperation === 'GETALL') {
        command = 'GETALL';
        response = await sendCommand(command);
      } else {
        command = `GET ${selectedFiles.join(' ')}`;
        response = await sendCommand(command);
      }

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.type === 'text' && (response.data.startsWith('Invalid') || response.data.startsWith('Error'))) {
        throw new Error(response.data);
      }

      // Save the file
      saveFile(response.data, filename);
      setStatus(`Files saved to ${filename}`);
    } catch (error) {
      setStatus(`Download failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      setShowSaveDialog(false);
      setOutputFilename('');
    }
  };

  // Save received blob to file
  const saveFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Toggle file selection
  const toggleFileSelection = (file) => {
    if (selectedFiles.includes(file)) {
      setSelectedFiles(selectedFiles.filter(f => f !== file));
    } else {
      setSelectedFiles([...selectedFiles, file]);
    }
  };

  // Select all files
  const selectAllFiles = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles([...files]);
    }
  };

  // Render file list
  const renderFileList = () => {
    if (files.length === 0) {
      return <div className="empty-state">No files available</div>;
    }

    return (
      <div className="file-list">
        <div className="file-list-header">
          <button 
            className="select-all-btn"
            onClick={selectAllFiles}
          >
            {selectedFiles.length === files.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        {files.map(file => (
          <div 
            key={file}
            className={`file-item ${selectedFiles.includes(file) ? 'selected' : ''}`}
            onClick={() => toggleFileSelection(file)}
          >
            <div className="checkbox">
              {selectedFiles.includes(file) ? '✓' : ''}
            </div>
            <div className="file-name">{file}</div>
          </div>
        ))}
      </div>
    );
  };

  // Render save dialog
  const renderSaveDialog = () => {
    if (!showSaveDialog) return null;

    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>Save Archive</h3>
          <div className="input-group">
            <label>Enter filename for archive:</label>
            <input
              type="text"
              value={outputFilename}
              onChange={(e) => setOutputFilename(e.target.value)}
              placeholder="filename.tar.gz"
              autoFocus
            />
          </div>
          <div className="button-group">
            <button 
              className="primary-button"
              onClick={executeFileDownload}
              disabled={!outputFilename}
            >
              Save
            </button>
            <button 
              className="secondary-button"
              onClick={() => {
                setShowSaveDialog(false);
                setOutputFilename('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Component render
  return (
    <div className="app-container">
      <h1>File Transfer Client</h1>
      
      {/* Connection Panel */}
      <div className="connection-panel">
        <div className="input-group">
          <label>Server:</label>
          <input
            type="text"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            disabled={connected}
            placeholder="localhost"
          />
        </div>
        <div className="input-group">
          <label>Port:</label>
          <input
            type="text"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={connected}
            placeholder="12345"
          />
        </div>
        <button
          className="primary-button"
          onClick={connected ? disconnect : connect}
          disabled={isLoading}
        >
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      
      {/* Status Bar */}
      <div className="status-bar">
        <span>Status: {status}</span>
        {isLoading && <div className="loader"></div>}
      </div>
      
      {/* Main Content */}
      {connected && (
        <div className="main-content">
          <div className="action-panel">
            <button 
              className="action-button"
              onClick={refreshFileList}
              disabled={isLoading}
            >
              Refresh Files
            </button>
            <button 
              className="action-button"
              onClick={handleGetFiles}
              disabled={selectedFiles.length === 0 || isLoading}
            >
              Get Selected Files
            </button>
            <button 
              className="action-button"
              onClick={handleGetAllFiles}
              disabled={files.length === 0 || isLoading}
            >
              Get All Files
            </button>
          </div>
          
          {/* File List */}
          {renderFileList()}
        </div>
      )}
      
      {/* Save Dialog */}
      {renderSaveDialog()}
    </div>
  );
}

// CSS styles
const styles = `
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f5f8fa;
  color: #333;
}

.app-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  color: #2c3e50;
  margin-bottom: 24px;
  text-align: center;
}

.connection-panel {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.input-group {
  display: flex;
  flex-direction: column;
  flex: 1;
}

label {
  margin-bottom: 5px;
  font-weight: 500;
  color: #555;
}

input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #3498db;
}

input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s, transform 0.1s;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:active:not(:disabled) {
  transform: translateY(1px);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary-button {
  background-color: #3498db;
  color: white;
}

.primary-button:hover:not(:disabled) {
  background-color: #2980b9;
}

.secondary-button {
  background-color: #ecf0f1;
  color: #2c3e50;
}

.secondary-button:hover:not(:disabled) {
  background-color: #dde4e6;
}

.action-button {
  background-color: #3498db;
  color: white;
  flex: 1;
}

.action-button:hover:not(:disabled) {
  background-color: #2980b9;
}

.action-panel {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
  padding: 10px 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  font-size: 14px;
}

.main-content {
  background-color: #fff;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.file-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
}

.file-list-header {
  padding: 10px 15px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #eee;
}

.select-all-btn {
  background-color: transparent;
  color: #3498db;
  padding: 5px 10px;
  font-size: 12px;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 10px 15px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background-color 0.2s;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background-color: #f8f9fa;
}

.file-item.selected {
  background-color: #ebf5fb;
}

.checkbox {
  width: 20px;
  height: 20px;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  color: #3498db;
  font-weight: bold;
}

.file-name {
  flex: 1;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #777;
  font-style: italic;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.modal h3 {
  margin-top: 0;
  color: #2c3e50;
}

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.loader {
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

// Create style element
const styleElement = document.createElement('style');
styleElement.textContent = styles;
document.head.appendChild(styleElement);

// Render application
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<FileTransferClient />);
