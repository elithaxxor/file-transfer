```markdown
# Enhanced File Transfer Client v2.0.1

## Overview

This repository contains the source code for the Enhanced File Transfer Client, a React-based application designed to manage file transfers with a server. The client application includes features such as directory navigation, file metadata display, search functionality, and real-time updates via WebSocket.

## Components

### VirtualList Component

```javascript
const VirtualList = ({ items, itemHeight, height, renderItem }) => {
  // Virtual list component for efficient rendering of large lists
};
```

- **Purpose**: Efficiently render large lists by only displaying the visible items within the viewport.
- **Parameters**:
  - `items`: Array of items to be displayed.
  - `itemHeight`: Height of each item in the list.
  - `height`: Height of the container.
  - `renderItem`: Function to render each item.

### DirectoryTree Component

```javascript
const DirectoryTree = ({ files, onSelectFile, selectedPath }) => {
  // Tree view component for directory navigation
};
```

- **Purpose**: Display a hierarchical tree view for directory navigation.
- **Parameters**:
  - `files`: Array of file/directory objects.
  - `onSelectFile`: Function to call when a file or directory is selected.
  - `selectedPath`: Path of the currently selected file or directory.

### FileMetadataPanel Component

```javascript
const FileMetadataPanel = ({ file }) => {
  // File metadata panel component
};
```

- **Purpose**: Display metadata information about the selected file.
- **Parameters**:
  - `file`: Object containing metadata of the selected file.

### SearchBox Component

```javascript
const SearchBox = ({ onSearch }) => {
  // Search component
};
```

- **Purpose**: Provide a search input field for filtering files by name.
- **Parameters**:
  - `onSearch`: Function to call when the search query changes.

### Main Application Component (FileTransferClient)

```javascript
function FileTransferClient() {
  // Main application component
}
```

- **Purpose**: Manage state and handle file operations for the Enhanced File Transfer System.
- **State Variables**:
  - `server`, `port`, `connected`: Manage server connection details.
  - `files`, `filteredFiles`, `fileCache`, `selectedFile`, `selectedPath`, `currentDirectory`: Handle file and directory data.
  - `status`, `isLoading`, `uploadProgress`, `downloadProgress`, `showUploadDialog`, `showSaveDialog`, `outputFilename`, `currentOperation`, `compressionLevel`: Manage UI state and operations.
  - `wsConnected`, `ws`: Handle WebSocket connection state.
  - `searchQuery`, `searchResults`, `showSearchResults`: Manage search state.

### WebSocket Connection

```javascript
const connectWebSocket = useCallback(() => {
  // WebSocket connection logic...
}, [server, port, connected, searchQuery]);
```

- **Purpose**: Establish and manage the WebSocket connection for real-time updates.
- **Dependencies**: `server`, `port`, `connected`, `searchQuery`.

### Apply File Filter

```javascript
const applyFileFilter = useCallback((fileList, query) => {
  // Filter files based on search query...
}, []);
```

- **Purpose**: Filter the file list based on the search query.
- **Dependencies**: None (defined within the function).

### Handle Search

```javascript
const handleSearch = useCallback((query) => {
  // Handle search input...
}, [applyFileFilter, files]);
```

- **Purpose**: Update the search query and apply the file filter.
- **Dependencies**: `applyFileFilter`, `files`.

### Connect to Server

```javascript
const connect = useCallback(async (retry = 0) => {
  // Connect to the server...
}, [server, port]);
```

- **Purpose**: Establish a connection to the server.
- **Dependencies**: `server`, `port`.

### Disconnect from Server

```javascript
const disconnect = useCallback(async () => {
  // Disconnect from the server...
}, []);
```

- **Purpose**: Disconnect from the server and reset the state.
- **Dependencies**: None (defined within the function).

### Send Command to Server

```javascript
const sendCommand = useCallback(async (command, options = {}, retry = 0) => {
  // Send a command to the server with retry logic...
}, [server, port, fileCache]);
```

- **Purpose**: Send a command to the server with retry logic.
- **Dependencies**: `server`, `port`, `fileCache`.

### Refresh File List

```javascript
const refreshFileList = useCallback(async () => {
  // Refresh the file list from the server...
}, [connected, currentDirectory, sendCommand, searchQuery, applyFileFilter]);
```

- **Purpose**: Retrieve and update the file list from the server.
- **Dependencies**: `connected`, `currentDirectory`, `sendCommand`, `searchQuery`, `applyFileFilter`.

### Handle File Selection

```javascript
const handleSelectFile = useCallback((file) => {
  // Handle file selection...
}, []);
```

- **Purpose**: Update the selected file and directory state.
- **Dependencies**: None (defined within the function).

### Handle File Download

```javascript
const handleGetFiles = useCallback(() => {
  // Initiate file download...
}, [selectedFile]);
```

- **Purpose**: Initiate the file download process.
- **Dependencies**: `selectedFile`.

### Handle All Files Download

```javascript
const handleGetAllFiles = useCallback(() => {
  // Initiate download of all files...
}, []);
```

- **Purpose**: Initiate the download of all files.
- **Dependencies**: None (defined within the function).

### Execute File Download

```javascript
const executeFileDownload = useCallback(async () => {
  // Execute the file download with progress tracking...
}, [outputFilename, currentOperation, selectedFile, compressionLevel, sendCommand]);
```

- **Purpose**: Execute the file download process with progress tracking.
- **Dependencies**: `outputFilename`, `currentOperation`, `selectedFile`, `compressionLevel`, `sendCommand`.

### Save File

```javascript
const saveFile = useCallback((blob, filename) => {
  // Save the downloaded file...
}, []);
```

- **Purpose**: Save the downloaded file to the user's system.
- **Dependencies**: None (defined within the function).

### Handle File Upload

```javascript
const handleFileUpload = useCallback((event) => {
  // Handle file upload with progress tracking...
}, [server, port, currentDirectory, refreshFileList]);
```

- **Purpose**: Handle file upload with progress tracking.
- **Dependencies**: `server`, `port`, `currentDirectory`, `refreshFileList`.

### Trigger File Upload

```javascript
const triggerFileUpload = useCallback(() => {
  // Trigger file upload dialog...
}, []);
```

- **Purpose**: Trigger the file upload dialog.
- **Dependencies**: None (defined within the function).

### Render the Application

```javascript
return (
  // JSX rendering for the application...
);
```

- **Purpose**: Render the entire application UI, including connection panel, status bar, main content, action panel, search box, file explorer, and modals.

## Running the Application

To run the Enhanced File Transfer Client, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/elithaxxor/file-transfer.git
   cd file-transfer/enhanced-file_transfer/client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`.
