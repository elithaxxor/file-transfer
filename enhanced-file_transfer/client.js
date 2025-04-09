import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Virtual list component for efficient rendering of large lists
const VirtualList = ({ items, itemHeight, height, renderItem }) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight));
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + height) / itemHeight)
  );

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      ...item,
      index: startIndex + index
    }));
  }, [items, startIndex, endIndex]);

  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className="virtual-list-container"
      style={{ height: `${height}px`, overflowY: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item) => renderItem(item))}
        </div>
      </div>
    </div>
  );
};

// Tree view component for directory navigation
const DirectoryTree = ({ files, onSelectFile, selectedPath }) => {
  const renderTree = (node, level = 0) => {
    const isDirectory = node.type === 'directory';
    const isSelected = node.path === selectedPath;
    const [expanded, setExpanded] = useState(level < 1); // Auto-expand first level

    const toggleExpanded = (e) => {
      e.stopPropagation();
      setExpanded(!expanded);
    };

    return (
      <div key={node.path} className="tree-node-container">
        <div 
          className={`tree-node ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20}px` }}
          onClick={() => onSelectFile(node)}
        >
          <span className="tree-icon" onClick={isDirectory ? toggleExpanded : null}>
            {isDirectory ? (expanded ? '📂' : '📁') : '📄'}
          </span>
          <span className="tree-label">{node.name}</span>
        </div>
        
        {isDirectory && expanded && node.children && (
          <div className="tree-children">
            {node.children.map(child => renderTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="directory-tree">
      {files.map(file => renderTree(file))}
    </div>
  );
};

// File metadata panel component
const FileMetadataPanel = ({ file }) => {
  if (!file) return <div className="metadata-panel">No file selected</div>;

  // Format date
  const formatDate = (date) => {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString();
  };

  // Format file size
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="metadata-panel">
      <h3>File Information</h3>
      <table>
        <tbody>
          <tr>
            <td>Name:</td>
            <td>{file.name}</td>
          </tr>
          <tr>
            <td>Path:</td>
            <td>{file.path}</td>
          </tr>
          <tr>
            <td>Type:</td>
            <td>{file.type === 'directory' ? 'Directory' : 'File'}</td>
          </tr>
          <tr>
            <td>Size:</td>
            <td>{formatSize(file.size)}</td>
          </tr>
          <tr>
            <td>Created:</td>
            <td>{formatDate(file.created)}</td>
          </tr>
          <tr>
            <td>Modified:</td>
            <td>{formatDate(file.modified)}</td>
          </tr>
          {file.versions && file.versions.length > 0 && (
            <tr>
              <td>Versions:</td>
              <td>{file.versions.length}</td>
            </tr>
          )}
        </tbody>
      </table>
      
      {file.versions && file.versions.length > 0 && (
        <div className="versions-section">
          <h4>Previous Versions</h4>
          {file.versions.map(version => (
            <div className="version-item" key={version.version}>
              <span>v{version.version}</span>
              <span>{formatDate(version.date)}</span>
              <span>{formatSize(version.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Search component
const SearchBox = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);

  const handleSearch = useCallback((value) => {
    setQuery(value);
    
    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      onSearch(value);
    }, 300);
    
    setSearchTimeout(timeout);
  }, [onSearch, searchTimeout]);

  return (
    <div className="search-box">
      <input 
        type="text" 
        placeholder="Search files..." 
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
      />
    </div>
  );
};

// Main application component
function FileTransferClient() {
  // State variables for configuration and connection
  const [server, setServer] = useState('localhost');
  const [port, setPort] = useState('12345');
  const [connected, setConnected] = useState(false);
  
  // State variables for file handling
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [fileCache, setFileCache] = useState({}); // Client-side file cache
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [currentDirectory, setCurrentDirectory] = useState('');
  
  // State variables for operations
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [outputFilename, setOutputFilename] = useState('');
  const [currentOperation, setCurrentOperation] = useState(null);
  const [compressionLevel, setCompressionLevel] = useState(6);
  
  // WebSocket connection
  const [wsConnected, setWsConnected] = useState(false);
  const ws = useRef(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Maximum number of retries for operations
  const MAX_RETRIES = 3;
  
  // Connect to WebSocket server for real-time updates
  const connectWebSocket = useCallback(() => {
    if (ws.current) {
      ws.current.close();
    }
    
    const wsUrl = `ws://${server}:${port}`;
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
    };
    
    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
      
      // Try to reconnect after 5 seconds if still connected to server
      if (connected) {
        setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };
    
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'fileUpdate') {
        // Refresh file list when files change
        refreshFileList();
      } else if (data.type === 'fileList') {
        // Update file list
        setFiles(data.files);
        applyFileFilter(data.files, searchQuery);
      } else if (data.type === 'error') {
        setStatus(`Error: ${data.message}`);
      }
    };
  }, [server, port, connected, searchQuery]);
  
  // Initialize WebSocket connection when connected to server
  useEffect(() => {
    if (connected) {
      connectWebSocket();
    }
    
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connected, connectWebSocket]);
  
  // Apply file filter based on search query
  const applyFileFilter = useCallback((fileList, query) => {
    if (!query) {
      setFilteredFiles(fileList);
      setShowSearchResults(false);
      return;
    }
    
    setShowSearchResults(true);
    
    // Flatten the file structure for search
    const flattenFiles = (files, results = []) => {
      files.forEach(file => {
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(file);
        }
        
        if (file.children && file.children.length > 0) {
          flattenFiles(file.children, results);
        }
      });
      
      return results;
    };
    
    const results = flattenFiles(fileList);
    setSearchResults(results);
  }, []);
  
  // Handle search
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    applyFileFilter(files, query);
  }, [applyFileFilter, files]);
  
  // Connect to server
  const connect = useCallback(async (retry = 0) => {
    if (!server || !port) {
      setStatus('Please enter server address and port');
      return;
    }
    
    setIsLoading(true);
    try {
      // Test connection by sending LIST command
      const response = await sendCommand('LIST', {}, retry);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Update UI
      setConnected(true);
      setFiles(response);
      setFilteredFiles(response);
      setStatus('Connected successfully');
      
      // Clear cache on new connection
      setFileCache({});
    } catch (error) {
      setStatus(`Connection failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [server, port]);
  
  // Disconnect from server
  const disconnect = useCallback(async () => {
    try {
      await sendCommand('QUIT');
    } catch (error) {
      console.error('Error sending QUIT command:', error);
    }
    
    // Close WebSocket
    if (ws.current) {
      ws.current.close();
    }
    
    setConnected(false);
    setWsConnected(false);
    setFiles([]);
    setFilteredFiles([]);
    setSelectedFile(null);
    setCurrentDirectory('');
    setStatus('Disconnected');
    
    // Clear cache on disconnect
    setFileCache({});
  }, []);
  
  // Send command to server with retry mechanism
  const sendCommand = useCallback(async (command, options = {}, retry = 0) => {
    try {
      const url = `http://${server}:${port}/command`;
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: command,
      };
      
      // Add query parameters if provided
      if (options.params) {
        const queryParams = new URLSearchParams(options.params);
        url += `?${queryParams.toString()}`;
      }
      
      // Check if the response is in cache
      const cacheKey = `${command}_${JSON.stringify(options)}`;
      if (command.startsWith('LIST') && fileCache[cacheKey] && options.bypassCache !== true) {
        console.log(`Using cached response for ${command}`);
        return fileCache[cacheKey];
      }
      
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded with status: ${response.status}, ${errorText}`);
      }
      
      // Check content type to determine response handling
      const contentType = response.headers.get('Content-Type');
      
      if (contentType && contentType.includes('application/json')) {
        const jsonResponse = await response.json();
        
        // Cache LIST responses
        if (command.startsWith('LIST') && !options.bypassCache) {
          setFileCache(prevCache => ({
            ...prevCache,
            [cacheKey]: jsonResponse
          }));
        }
        
        return jsonResponse;
      } else if (contentType && (contentType.includes('application/gzip') || contentType.includes('application/octet-stream'))) {
        // For binary responses, handle the download
        return {
          type: 'file',
          blob: await response.blob(),
          filename: getFilenameFromHeader(response.headers.get('Content-Disposition'))
        };
      } else {
        // For text responses
        return await response.text();
      }
    } catch (error) {
      console.error(`Error sending command (attempt ${retry + 1}/${MAX_RETRIES}):`, error);
      
      // Retry logic
      if (retry < MAX_RETRIES - 1) {
        const nextRetry = retry + 1;
        const backoffDelay = Math.pow(2, nextRetry) * 1000; // Exponential backoff
        
        setStatus(`Connection error. Retrying in ${backoffDelay / 1000} seconds...`);
        
        return new Promise(resolve => {
          setTimeout(async () => {
            resolve(await sendCommand(command, options, nextRetry));
          }, backoffDelay);
        });
      }
      
      throw error;
    }
  }, [server, port, fileCache]);
  
  // Extract filename from Content-Disposition header
  const getFilenameFromHeader = (header) => {
    if (!header) return 'download.tar.gz';
    
    const matches = /filename="?([^"]+)"?/.exec(header);
    return matches && matches[1] ? matches[1] : 'download.tar.gz';
  };
  
  // Refresh file list
  const refreshFileList = useCallback(async () => {
    if (!connected) return;
    
    setIsLoading(true);
    try {
      const command = currentDirectory ? `LIST ${currentDirectory}` : 'LIST';
      const response = await sendCommand(command, { bypassCache: true });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      setFiles(response);
      applyFileFilter(response, searchQuery);
      setStatus('File list refreshed');
    } catch (error) {
      setStatus(`Failed to refresh files: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [connected, currentDirectory, sendCommand, searchQuery, applyFileFilter]);
  
  // Handle file selection
  const handleSelectFile = useCallback((file) => {
    setSelectedFile(file);
    setSelectedPath(file.path);
    
    if (file.type === 'directory') {
      setCurrentDirectory(file.path);
    }
  }, []);
  
  // Handle file download with compression options
  const handleGetFiles = useCallback(() => {
    if (!selectedFile) {
      setStatus('Please select a file or directory');
      return;
    }
    
    setCurrentOperation('GET');
    setShowSaveDialog(true);
  }, [selectedFile]);
  
  // Handle all files download
  const handleGetAllFiles = useCallback(() => {
    setCurrentOperation('GETALL');
    setShowSaveDialog(true);
  }, []);
  
  // Execute file download with progress tracking
  const executeFileDownload = useCallback(async () => {
    if (!outputFilename) {
      setStatus('Please enter a filename');
      return;
    }
    
    // Ensure filename has .tar.gz extension for archives
    let filename = outputFilename;
    if (!filename.endsWith('.tar.gz') && (currentOperation === 'GETALL' || (selectedFile && selectedFile.type === 'directory'))) {
      filename += '.tar.gz';
    }
    
    setIsLoading(true);
    setDownloadProgress(0);
    
    try {
      let command, params = {};
      
      // Add compression level to params
      params.compression = compressionLevel;
      
      if (currentOperation === 'GETALL') {
        command = 'GETALL';
      } else {
        command = `GET ${selectedFile.path}`;
      }
      
      const response = await sendCommand(command, { params });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (typeof response === 'string' && (response.startsWith('Invalid') || response.startsWith('Error'))) {
        throw new Error(response);
      }
      
      // Save the file
      if (response.type === 'file') {
        saveFile(response.blob, response.filename || filename);
        setStatus(`File saved as ${response.filename || filename}`);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      setStatus(`Download failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      setDownloadProgress(100);
      setShowSaveDialog(false);
      setOutputFilename('');
    }
  }, [outputFilename, currentOperation, selectedFile, compressionLevel, sendCommand]);
  
  // Save received blob to file
  const saveFile = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);
  
  // Handle file upload
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    setUploadProgress(0);
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Define upload path based on current directory
    const uploadPath = currentDirectory ? 
      `${currentDirectory}/${file.name}` : 
      file.name;
    
    // Use fetch with progress tracking
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `http://${server}:${port}/upload?path=${encodeURIComponent(uploadPath)}`);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(progress);
      }
    };
    
    xhr.onload = function() {
      if (xhr.status === 200) {
        setStatus(`File uploaded successfully: ${uploadPath}`);
        refreshFileList();
      } else {
        setStatus(`Upload failed: ${xhr.statusText}`);
      }
      setIsLoading(false);
      setUploadProgress(100);
    };
    
    xhr.onerror = function() {
      setStatus('Upload failed: Network error');
      setIsLoading(false);
    };
    
    // Read file as binary
    const reader = new FileReader();
    reader.onload = function() {
      xhr.send(reader.result);
    };
    reader.readAsArrayBuffer(file);
  }, [server, port, currentDirectory, refreshFileList]);
  
  // Handle file upload button click
  const triggerFileUpload = useCallback(() => {
    document.getElementById('file-upload').click();
  }, []);
  
  // Component render
  return (
    <div className="app-container">
      <div className="app-header">
        <h1>Enhanced File Transfer Client</h1>
        
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
      </div>
      
      {/* Status Bar */}
      <div className="status-bar">
        <span>Status: {status}</span>
        {isLoading && <div className="loader"></div>}
        {wsConnected && <span className="ws-status">WebSocket: Connected</span>}
        
        {(uploadProgress > 0 && uploadProgress < 100) && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
            <span>{uploadProgress}%</span>
          </div>
        )}
        
        {(downloadProgress > 0 && downloadProgress < 100) && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${downloadProgress}%` }}></div>
            <span>{downloadProgress}%</span>
          </div>
        )}
      </div>
      
      {/* Main Content */}
      {connected && (
        <div className="main-content">
          {/* Action Panel */}
          <div className="action-panel">
            <button 
              className="action-button"
              onClick={refreshFileList}
              disabled={isLoading}
            >
              Refresh
            </button>
            <button 
              className="action-button"
              onClick={handleGetFiles}
              disabled={!selectedFile || isLoading}
            >
              Download
            </button>
            <button 
              className="action-button"
              onClick={handleGetAllFiles}
              disabled={isLoading}
            >
              Download All
            </button>
            <button 
              className="action-button"
              onClick={triggerFileUpload}
              disabled={isLoading}
            >
              Upload
            </button>
            <input 
              id="file-upload" 
              type="file" 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />
          </div>
          
          {/* Search Box */}
          <SearchBox onSearch={handleSearch} />
          
          {/* Main Container */}
          <div className="file-explorer">
            {/* Directory Tree */}
            <div className="sidebar">
              <h3>Directories</h3>
              <DirectoryTree 
                files={files} 
                onSelectFile={handleSelectFile}
                selectedPath={selectedPath}
              />
            </div>
            
            {/* File List / Search Results */}
            <div className="file-list-container">
              <h3>{showSearchResults ? 'Search Results' : 'Files'}</h3>
              {showSearchResults ? (
                <VirtualList
                  items={searchResults}
                  itemHeight={40}
                  height={400}
                  renderItem={(item) => (
                    <div 
                      key={item.path} 
                      className={`file-item ${selectedPath === item.path ? 'selected' : ''}`}
                      onClick={() => handleSelectFile(item)}
                    >
                      <span className="file-icon">
                        {item.type === 'directory' ? '📁' : '📄'}
                      </span>
                      <span className="file-name">{item.name}</span>
                      <span className="file-path">{item.path}</span>
                    </div>
                  )}
                />
              ) : currentDirectory ? (
                <div className="current-directory-files">
                  {files.find(f => f.path === currentDirectory)?.children?.map(file => (
                    <div 
                      key={file.path} 
                      className={`file-item ${selectedPath === file.path ? 'selected' : ''}`}
                      onClick={() => handleSelectFile(file)}
                    >
                      <span className="file-icon">
                        {file.type === 'directory' ? '📁' : '📄'}
                      </span>
                      <span className="file-name">{file.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="root-files">
                  {files.map(file => (
                    <div 
                      key={file.path} 
                      className={`file-item ${selectedPath === file.path ? 'selected' : ''}`}
                      onClick={() => handleSelectFile(file)}
                    >
                      <span className="file-icon">
                        {file.type === 'directory' ? '📁' : '📄'}
                      </span>
                      <span className="file-name">{file.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* File Metadata Panel */}
            <div className="details-panel">
              <FileMetadataPanel file={selectedFile} />
            </div>
          </div>
        </div>
      )}
      
      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Save File</h3>
            <div className="input-group">
              <label>Enter filename:</label>
              <input
                type="text"
                value={outputFilename}
                onChange={(e) => setOutputFilename(e.target.value)}
                placeholder={selectedFile ? selectedFile.name : "download.tar.gz"}
                autoFocus
              />
            </div>
            
            <div className="input-group">
              <label>Compression Level (1-9):</label>
              <div className="compression-slider">
                <input
                  type="range"
                  min="1"
                  max="9"
                  value={compressionLevel}
                  onChange={(e) => setCompressionLevel(parseInt(e.target.value))}
                />
                <span>{compressionLevel}</span>
              </div>
              <div className="compression-help">
                <span>Faster</span>
                <span>Smaller</span>
              </div>
            </div>
            
            <div className="button-group">
              <button 
                className="primary-button"
                onClick={executeFileDownload}
                disabled={!outputFilename}
              >
                Download
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
      )}
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
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.app-header {
  margin-bottom: 20px;
}

h1 {
  color: #2c3e50;
  margin-bottom: 20px;
  text-align: center;
}

h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #3498db;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
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
  gap: 15px;
  margin: 15px 0;
  padding: 10px 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  font-size: 14px;
}

.ws-status {
  display: inline-flex;
  align-items: center;
  color: #27ae60;
  font-weight: 500;
}

.ws-status::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  background-color: #2ecc71;
  border-radius: 50%;
  margin-right: 6px;
}

.main-content {
  background-color: #fff;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.file-explorer {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  gap: 15px;
  height: 600px;
}

.sidebar {
  border-right: 1px solid #eee;
  padding-right: 15px;
  overflow-y: auto;
}

.file-list-container {
  overflow-y: auto;
}

.details-panel {
  border-left: 1px solid #eee;
  padding-left: 15px;
  overflow-y: auto;
}

.tree-node-container {
  margin-bottom: 2px;
}

.tree-node {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.tree-node:hover {
  background-color: #f1f5f9;
}

.tree-node.selected {
  background-color: #e3f2fd;
  font-weight: 500;
}

.tree-icon {
  margin-right: 8px;
  cursor: pointer;
}

.tree-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-children {
  margin-left: 15px;
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
  background-color: #f1f5f9;
}

.file-item.selected {
  background-color: #e3f2fd;
}

.file-icon {
  margin-right: 10px;
}

.file-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-path {
  color: #7f8c8d;
  font-size: 12px;
  margin-left: 10px;
}

.metadata-panel {
  padding: 15px;
}

.metadata-panel table {
  width: 100%;
  border-collapse: collapse;
}

.metadata-panel td {
  padding: 6px 0;
  border-bottom: 1px solid #eee;
}

.metadata-panel td:first-child {
  font-weight: 500;
  width: 35%;
}

.versions-section {
  margin-top: 20px;
}

.version-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.search-box {
  margin-bottom: 15px;
}

.search-box input {
  width: 100%;
  padding: 10px 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.search-box input:focus {
  outline: none;
  border-color: #3498db;
}

.virtual-list-container {
  border: 1px solid #eee;
  border-radius: 4px;
}

.loader {
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

.progress-bar {
  height: 18px;
  width: 150px;
  background-color: #f1f1f1;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.3s ease;
}

.progress-bar span {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
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
  width: 450px;
  max-width: 90%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.modal h3 {
  margin-top: 0;
  color: #2c3e50;
}

.compression-slider {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compression-slider input {
  flex: 1;
}

.compression-help {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 4px;
}

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
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
