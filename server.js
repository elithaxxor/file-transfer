const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { exec } = require('child_process');

/*# File Transfer Client - Setup Instructions

This package contains a complete client-server solution for file transfers:
1. A React-based GUI client
2. A Node.js server implementation

## Server Setup
### Prerequisites
- Node.js (v14 or newer)
- npm (v6 or newer)

### Installation

1. Create a new directory for the server:
```
mkdir file-transfer-server
cd file-transfer-server
```

2. Initialize a new Node.js project:
```
npm init -y
```

3. Install dependencies:
```
npm install express cors archiver
```

4. Create a file named `server.js` and copy the content from the "Server Implementation" artifact.

5. Create a directory for storing files:
```
mkdir files
```

6. Start the server:
```
node server.js
```.
The server will run on port 12345 by default. You can change this by setting the PORT environment variable.
Some test files will be automatically created in the "files" directory.

## Troubleshooting

- If you can't connect to the server, check that the server is running and that the firewall allows connections on the specified port.
- If you get an "Invalid command" error, check that you're using one of the supported commands (LIST, GETALL, GET, QUIT).
- If you get a "Files not found" error, check that the files you're requesting exist on the server.
*/
// Create Express app
const app = express();
const PORT = process.env.PORT || 12345;

// Configure middleware
app.use(cors());
app.use(express.text());

// Set directory where files are stored
const FILES_DIR = path.join(__dirname, 'files');

// Create files directory if it doesn't exist
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR);
}

// Handle commands from the client
app.post('/command', (req, res) => {
  const command = req.body.trim();
  console.log(`Received command: ${command}`);

  if (command === 'LIST') {
    // List all files in the directory
    handleListCommand(req, res);
  } else if (command === 'GETALL') {
    // Get all files as a tar.gz archive
    handleGetAllCommand(req, res);
  } else if (command.startsWith('GET ')) {
    // Get specified files as a tar.gz archive
    handleGetCommand(req, res, command.substring(4).trim());
  } else if (command === 'QUIT') {
    // Client is disconnecting
    res.send('Goodbye');
  } else {
    // Invalid command
    res.status(400).send('Invalid command');
  }
});

// Handle LIST command
function handleListCommand(req, res) {
  try {
    const files = fs.readdirSync(FILES_DIR);
    res.send(files.join('\n'));
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
}

// Handle GETALL command
function handleGetAllCommand(req, res) {
  try {
    const files = fs.readdirSync(FILES_DIR);
    
    if (files.length === 0) {
      return res.status(404).send('Error: No files available');
    }

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename=all_files.tar.gz');

    // Create and pipe archive to response
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 }
    });

    archive.pipe(res);

    // Add all files to the archive
    files.forEach(file => {
      const filePath = path.join(FILES_DIR, file);
      archive.file(filePath, { name: file });
    });

    archive.finalize();
  } catch (error) {
    console.error('Error getting all files:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
}

// Handle GET command with filenames
function handleGetCommand(req, res, fileNamesStr) {
  try {
    const requestedFiles = fileNamesStr.split(' ').filter(Boolean);
    
    if (requestedFiles.length === 0) {
      return res.status(400).send('Invalid command: No files specified');
    }

    // Check if all requested files exist
    const allFiles = fs.readdirSync(FILES_DIR);
    const missingFiles = requestedFiles.filter(file => !allFiles.includes(file));

    if (missingFiles.length > 0) {
      return res.status(404).send(`Error: Files not found: ${missingFiles.join(', ')}`);
    }

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename=selected_files.tar.gz');

    // Create and pipe archive to response
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 }
    });

    archive.pipe(res);

    // Add requested files to the archive
    requestedFiles.forEach(file => {
      const filePath = path.join(FILES_DIR, file);
      archive.file(filePath, { name: file });
    });

    archive.finalize();
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving files from: ${FILES_DIR}`);
});

// Helper function to initialize test files
function createTestFiles() {
  // Create some test files if the directory is empty
  const files = fs.readdirSync(FILES_DIR);
  
  if (files.length === 0) {
    console.log('Creating test files...');
    
    // Create 5 test files with some content
    for (let i = 1; i <= 5; i++) {
      const fileName = `test_file_${i}.txt`;
      const filePath = path.join(FILES_DIR, fileName);
      fs.writeFileSync(filePath, `This is test file ${i} with some sample content.\n`.repeat(10));
    }
    
    console.log('Test files created successfully.');
  }
}

// Create test files on startup
createTestFiles();
