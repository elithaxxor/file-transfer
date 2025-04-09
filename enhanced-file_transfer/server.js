const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { createReadStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const winston = require('winston');
const crypto = require('crypto');
const WebSocket = require('ws');
const http = require('http');
const chokidar = require('chokidar');
const zlib = require('zlib');
const NodeCache = require('node-cache');
const { exec } = require('child_process');

// Initialize the file cache with 10-minute TTL
const fileCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Setup Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log' })
  ]
});

// Error codes
const ERROR_CODES = {
  INVALID_COMMAND: 'E001',
  FILE_NOT_FOUND: 'E002',
  DIRECTORY_NOT_FOUND: 'E003',
  SERVER_ERROR: 'E004',
  COMPRESSION_ERROR: 'E005',
  INVALID_PATH: 'E006',
  UPLOAD_ERROR: 'E007',
  ACCESS_DENIED: 'E008',
  VERSION_NOT_FOUND: 'E009'
};

// Create Express app
const app = express();
const PORT = process.env.PORT || 12345;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Set directory where files are stored
const FILES_DIR = path.resolve(process.env.FILES_DIR || path.join(__dirname, 'files'));

// Configure middleware
app.use(cors());
app.use(express.text());
app.use(express.json());
app.use(express.raw({ limit: '50mb', type: 'application/octet-stream' }));

// Create necessary directories
const setupDirectories = () => {
  const dirs = [
    FILES_DIR,
  , 'documents', `document_${i}.txt`),
      `This is a sample document file ${i}.\n`.repeat(5)
    );
    
    fs.writeFileSync(
      path.join(FILES_DIR, 'images', `image_${i}.txt`),
      `This is a sample image file ${i} (pretending to be binary).\n`.repeat(5)
    );
    
    fs.writeFileSync(
      path.join(FILES_DIR, 'data', `data_${i}.json`),
      JSON.stringify({ id: i, name: `Sample data ${i}`, values: Array.from({ length: 5 }, (_, j) => j * i) }, null, 2)
    );
  }
  
  logger.info('Test files and directories created successfully.');
}

// Graceful shutdown handling
const gracefulShutdown = () => {
  logger.info('Received shutdown signal. Closing server gracefully...');
  
  // Close WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed.');
    
    // Close HTTP server
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds if still running
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  });
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Create test files on startup
createTestFiles();

// Start the server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Serving files from: ${FILES_DIR}`);
  logger.info(`WebSocket server started`);
});, '.versions'),
    path.join(FILES_DIR, '.cache')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      logger.info(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

setupDirectories();

// File watcher for real-time updates
const watcher = chokidar.watch(FILES_DIR, {
  ignored: /(^|[\/\\])\../, // Ignore dotfiles
  persistent: true
});

// Handle file system events
watcher
  .on('add', path => {
    logger.info(`File added: ${path}`);
    broadcastFileUpdate('add', path);
  })
  .on('change', path => {
    logger.info(`File changed: ${path}`);
    // Clear cache for this file
    const relativePath = path.replace(FILES_DIR, '').replace(/^\//, '');
    fileCache.del(relativePath);
    broadcastFileUpdate('change', path);
  })
  .on('unlink', path => {
    logger.info(`File deleted: ${path}`);
    broadcastFileUpdate('delete', path);
  })
  .on('addDir', path => {
    logger.info(`Directory added: ${path}`);
    broadcastFileUpdate('addDir', path);
  })
  .on('unlinkDir', path => {
    logger.info(`Directory deleted: ${path}`);
    broadcastFileUpdate('deleteDir', path);
  })
  .on('error', error => logger.error(`Watcher error: ${error}`));

// Broadcast file updates to connected clients
function broadcastFileUpdate(event, filePath) {
  const relativePath = filePath.replace(FILES_DIR, '').replace(/^\//, '');
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'fileUpdate',
        event,
        path: relativePath
      }));
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  logger.info('Client connected to WebSocket');
  
  ws.on('message', (message) => {
    logger.debug(`Received WebSocket message: ${message}`);
  });
  
  ws.on('close', () => {
    logger.info('Client disconnected from WebSocket');
  });
  
  // Send initial file list
  sendFileList(ws);
});

// Send file list to a WebSocket client
async function sendFileList(ws) {
  try {
    const files = await listFilesWithMetadata();
    ws.send(JSON.stringify({
      type: 'fileList',
      files
    }));
  } catch (error) {
    logger.error(`Error sending file list: ${error.message}`);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Error fetching file list: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    }));
  }
}

// Handle commands endpoint
app.post('/command', (req, res) => {
  const command = req.body.trim();
  logger.info(`Received command: ${command}`);

  if (command === 'LIST') {
    handleListCommand(req, res);
  } else if (command.startsWith('LIST ')) {
    handleListDirectoryCommand(req, res, command.substring(5).trim());
  } else if (command === 'GETALL') {
    handleGetAllCommand(req, res);
  } else if (command.startsWith('GET ')) {
    handleGetCommand(req, res, command.substring(4).trim());
  } else if (command.startsWith('SEARCH ')) {
    handleSearchCommand(req, res, command.substring(7).trim());
  } else if (command === 'METADATA') {
    handleMetadataCommand(req, res);
  } else if (command.startsWith('METADATA ')) {
    handleFileMetadataCommand(req, res, command.substring(9).trim());
  } else if (command === 'HEALTH') {
    handleHealthCommand(req, res);
  } else if (command === 'QUIT') {
    res.send('Goodbye');
  } else {
    logger.warn(`Invalid command received: ${command}`);
    res.status(400).json({
      error: 'Invalid command',
      code: ERROR_CODES.INVALID_COMMAND
    });
  }
});

// Get file metadata
function getFileMetadata(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const isDirectory = stats.isDirectory();
    
    // Calculate hash only for files
    let hash = null;
    if (!isDirectory) {
      const fileContent = fs.readFileSync(filePath);
      hash = crypto.createHash('md5').update(fileContent).digest('hex');
    }
    
    return {
      name: path.basename(filePath),
      path: path.relative(FILES_DIR, filePath),
      size: stats.size,
      isDirectory,
      created: stats.birthtime,
      modified: stats.mtime,
      hash,
      versions: isDirectory ? [] : getFileVersions(filePath)
    };
  } catch (error) {
    logger.error(`Error getting metadata for ${filePath}: ${error.message}`);
    return null;
  }
}

// Get file versions
function getFileVersions(filePath) {
  const basename = path.basename(filePath);
  const versionsDir = path.join(FILES_DIR, '.versions');
  const versionFiles = [];
  
  try {
    if (fs.existsSync(versionsDir)) {
      const files = fs.readdirSync(versionsDir);
      const regex = new RegExp(`^${basename}\\.v\\d+$`);
      
      files.forEach(file => {
        if (regex.test(file)) {
          const stats = fs.statSync(path.join(versionsDir, file));
          const versionMatch = file.match(/\.v(\d+)$/);
          if (versionMatch) {
            versionFiles.push({
              version: parseInt(versionMatch[1]),
              date: stats.mtime,
              size: stats.size
            });
          }
        }
      });
    }
  } catch (error) {
    logger.error(`Error getting versions for ${filePath}: ${error.message}`);
  }
  
  return versionFiles.sort((a, b) => b.version - a.version);
}

// REST endpoint for file upload
app.post('/upload', (req, res) => {
  const { path: targetPath } = req.query;
  
  if (!targetPath) {
    return res.status(400).json({
      error: 'Target path is required',
      code: ERROR_CODES.INVALID_PATH
    });
  }
  
  // Ensure the path is within the FILES_DIR
  const normalizedPath = path.normalize(targetPath);
  if (normalizedPath.includes('..')) {
    return res.status(400).json({
      error: 'Invalid path',
      code: ERROR_CODES.INVALID_PATH
    });
  }
  
  const filePath = path.join(FILES_DIR, normalizedPath);
  const dirPath = path.dirname(filePath);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      logger.error(`Error creating directory: ${error.message}`);
      return res.status(500).json({
        error: `Failed to create directory: ${error.message}`,
        code: ERROR_CODES.SERVER_ERROR
      });
    }
  }
  
  try {
    // If the file already exists, create a new version
    if (fs.existsSync(filePath)) {
      createFileVersion(filePath);
    }
    
    // Write the new file
    fs.writeFileSync(filePath, req.body);
    
    logger.info(`File uploaded successfully: ${filePath}`);
    res.json({
      message: 'File uploaded successfully',
      path: normalizedPath,
      metadata: getFileMetadata(filePath)
    });
  } catch (error) {
    logger.error(`Error uploading file: ${error.message}`);
    res.status(500).json({
      error: `Failed to upload file: ${error.message}`,
      code: ERROR_CODES.UPLOAD_ERROR
    });
  }
});

// Create a new version of a file
function createFileVersion(filePath) {
  try {
    const basename = path.basename(filePath);
    const versionsDir = path.join(FILES_DIR, '.versions');
    
    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true });
    }
    
    // Find the highest version number
    const files = fs.readdirSync(versionsDir);
    const versionRegex = new RegExp(`^${basename}\\.v(\\d+)$`);
    let maxVersion = 0;
    
    files.forEach(file => {
      const match = file.match(versionRegex);
      if (match) {
        const version = parseInt(match[1]);
        if (version > maxVersion) {
          maxVersion = version;
        }
      }
    });
    
    // Create a new version
    const newVersion = maxVersion + 1;
    const versionPath = path.join(versionsDir, `${basename}.v${newVersion}`);
    
    fs.copyFileSync(filePath, versionPath);
    logger.info(`Created new version for ${basename}: v${newVersion}`);
    
    return newVersion;
  } catch (error) {
    logger.error(`Error creating file version: ${error.message}`);
    return null;
  }
}

// Get a specific version of a file
app.get('/version', (req, res) => {
  const { path: filePath, version } = req.query;
  
  if (!filePath || !version) {
    return res.status(400).json({
      error: 'File path and version are required',
      code: ERROR_CODES.INVALID_PATH
    });
  }
  
  try {
    const basename = path.basename(filePath);
    const versionPath = path.join(FILES_DIR, '.versions', `${basename}.v${version}`);
    
    if (!fs.existsSync(versionPath)) {
      return res.status(404).json({
        error: 'Version not found',
        code: ERROR_CODES.VERSION_NOT_FOUND
      });
    }
    
    res.download(versionPath, basename);
  } catch (error) {
    logger.error(`Error retrieving version: ${error.message}`);
    res.status(500).json({
      error: `Failed to retrieve version: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
});

// Handle LIST command with metadata
async function handleListCommand(req, res) {
  try {
    const files = await listFilesWithMetadata();
    res.json(files);
  } catch (error) {
    logger.error(`Error listing files: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// List files with metadata
async function listFilesWithMetadata(dir = '') {
  const basePath = path.join(FILES_DIR, dir);
  
  try {
    const entries = fs.readdirSync(basePath);
    const result = [];
    
    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.startsWith('.')) continue;
      
      const entryPath = path.join(basePath, entry);
      const stats = fs.statSync(entryPath);
      const relativePath = path.relative(FILES_DIR, entryPath);
      
      if (stats.isDirectory()) {
        // For directories, add metadata and recursively list contents
        result.push({
          name: entry,
          path: relativePath,
          type: 'directory',
          size: await calculateDirectorySize(entryPath),
          created: stats.birthtime,
          modified: stats.mtime,
          children: await listFilesWithMetadata(relativePath)
        });
      } else {
        // For files, add metadata
        result.push({
          name: entry,
          path: relativePath,
          type: 'file',
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    }
    
    return result;
  } catch (error) {
    logger.error(`Error listing files: ${error.message}`);
    throw error;
  }
}

// Calculate directory size
async function calculateDirectorySize(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    let size = 0;
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        size += await calculateDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
    
    return size;
  } catch (error) {
    logger.error(`Error calculating directory size: ${error.message}`);
    return 0;
  }
}

// Handle LIST command for a specific directory
async function handleListDirectoryCommand(req, res, dirPath) {
  try {
    const normalizedPath = path.normalize(dirPath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({
        error: 'Invalid path',
        code: ERROR_CODES.INVALID_PATH
      });
    }
    
    const targetPath = path.join(FILES_DIR, normalizedPath);
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({
        error: 'Directory not found',
        code: ERROR_CODES.DIRECTORY_NOT_FOUND
      });
    }
    
    if (!fs.statSync(targetPath).isDirectory()) {
      return res.status(400).json({
        error: 'Path is not a directory',
        code: ERROR_CODES.INVALID_PATH
      });
    }
    
    const files = await listFilesWithMetadata(normalizedPath);
    res.json(files);
  } catch (error) {
    logger.error(`Error listing directory: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// Handle GETALL command with streaming
function handleGetAllCommand(req, res) {
  try {
    const compressionLevel = parseInt(req.query.compression || '6');
    const compressionOptions = {
      level: Math.min(Math.max(compressionLevel, 1), 9) // Ensure level is between 1-9
    };
    
    listAllFiles(FILES_DIR)
      .then(files => {
        if (files.length === 0) {
          return res.status(404).json({
            error: 'No files available',
            code: ERROR_CODES.FILE_NOT_FOUND
          });
        }
        
        // Set response headers for file download
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', 'attachment; filename=all_files.tar.gz');
        
        // Create archive with specified compression
        const archive = archiver('tar', {
          gzip: true,
          gzipOptions: compressionOptions
        });
        
        // Handle archive errors
        archive.on('error', (err) => {
          logger.error(`Archive error: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).json({
              error: `Archive error: ${err.message}`,
              code: ERROR_CODES.COMPRESSION_ERROR
            });
          }
        });
        
        // Pipe archive to response
        archive.pipe(res);
        
        // Add files to the archive using streams
        files.forEach(file => {
          const relativePath = path.relative(FILES_DIR, file);
          const stream = createReadStream(file);
          archive.append(stream, { name: relativePath });
        });
        
        archive.finalize();
      })
      .catch(error => {
        logger.error(`Error getting all files: ${error.message}`);
        res.status(500).json({
          error: `Error: ${error.message}`,
          code: ERROR_CODES.SERVER_ERROR
        });
      });
  } catch (error) {
    logger.error(`Error handling GETALL command: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// List all files recursively
async function listAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    if (file.startsWith('.')) continue; // Skip hidden files/directories
    
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      await listAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Handle GET command with streaming and chunking
function handleGetCommand(req, res, fileNamesStr) {
  try {
    const requestedFiles = fileNamesStr.split(' ').filter(Boolean);
    const compressionLevel = parseInt(req.query.compression || '6');
    const compressionOptions = {
      level: Math.min(Math.max(compressionLevel, 1), 9) // Ensure level is between 1-9
    };
    
    if (requestedFiles.length === 0) {
      return res.status(400).json({
        error: 'No files specified',
        code: ERROR_CODES.INVALID_COMMAND
      });
    }
    
    // Check if all requested files exist
    const filePromises = requestedFiles.map(async (file) => {
      const normalizedPath = path.normalize(file);
      
      if (normalizedPath.includes('..')) {
        throw new Error(`Invalid path: ${file}`);
      }
      
      const filePath = path.join(FILES_DIR, normalizedPath);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${file}`);
      }
      
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // For directories, recursively get all files
        const dirFiles = await listAllFiles(filePath);
        return { path: filePath, isDirectory: true, files: dirFiles };
      } else {
        // For files, return the file path
        return { path: filePath, isDirectory: false };
      }
    });
    
    Promise.all(filePromises)
      .then(results => {
        // Flatten the list of files
        const files = [];
        
        results.forEach(result => {
          if (result.isDirectory) {
            result.files.forEach(file => {
              files.push(file);
            });
          } else {
            files.push(result.path);
          }
        });
        
        if (files.length === 0) {
          return res.status(404).json({
            error: 'No files found',
            code: ERROR_CODES.FILE_NOT_FOUND
          });
        }
        
        // If there's only one file and it's not a directory, send it directly
        if (files.length === 1 && !results[0].isDirectory) {
          const filePath = files[0];
          const fileName = path.basename(filePath);
          const fileSize = fs.statSync(filePath).size;
          
          // Check if the client requested a specific range
          const range = req.headers.range;
          
          if (range) {
            // Parse the range header
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;
            
            // Set headers for range request
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${fileName}"`
            });
            
            // Create read stream for the specific range
            const stream = createReadStream(filePath, { start, end });
            stream.pipe(res);
          } else {
            // Set headers for full file download
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${fileName}"`
            });
            
            // Create read stream for the entire file
            const stream = createReadStream(filePath);
            stream.pipe(res);
          }
        } else {
          // Set response headers for archive download
          res.setHeader('Content-Type', 'application/gzip');
          res.setHeader('Content-Disposition', 'attachment; filename=selected_files.tar.gz');
          
          // Create archive with specified compression
          const archive = archiver('tar', {
            gzip: true,
            gzipOptions: compressionOptions
          });
          
          // Handle archive errors
          archive.on('error', (err) => {
            logger.error(`Archive error: ${err.message}`);
            if (!res.headersSent) {
              res.status(500).json({
                error: `Archive error: ${err.message}`,
                code: ERROR_CODES.COMPRESSION_ERROR
              });
            }
          });
          
          // Pipe archive to response
          archive.pipe(res);
          
          // Add files to the archive using streams
          files.forEach(file => {
            const relativePath = path.relative(FILES_DIR, file);
            const stream = createReadStream(file);
            archive.append(stream, { name: relativePath });
          });
          
          archive.finalize();
        }
      })
      .catch(error => {
        logger.error(`Error processing files: ${error.message}`);
        res.status(404).json({
          error: error.message,
          code: ERROR_CODES.FILE_NOT_FOUND
        });
      });
  } catch (error) {
    logger.error(`Error handling GET command: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// Handle SEARCH command
function handleSearchCommand(req, res, searchTerm) {
  try {
    if (!searchTerm) {
      return res.status(400).json({
        error: 'Search term is required',
        code: ERROR_CODES.INVALID_COMMAND
      });
    }
    
    // Search files by name
    listAllFiles(FILES_DIR)
      .then(files => {
        const results = files.filter(file => {
          const fileName = path.basename(file).toLowerCase();
          return fileName.includes(searchTerm.toLowerCase());
        });
        
        const searchResults = results.map(file => {
          const relativePath = path.relative(FILES_DIR, file);
          const stats = fs.statSync(file);
          
          return {
            name: path.basename(file),
            path: relativePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        });
        
        res.json(searchResults);
      })
      .catch(error => {
        logger.error(`Error searching files: ${error.message}`);
        res.status(500).json({
          error: `Error: ${error.message}`,
          code: ERROR_CODES.SERVER_ERROR
        });
      });
  } catch (error) {
    logger.error(`Error handling SEARCH command: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// Handle METADATA command for all files
function handleMetadataCommand(req, res) {
  try {
    listAllFiles(FILES_DIR)
      .then(files => {
        const metadata = files.map(file => getFileMetadata(file));
        res.json(metadata);
      })
      .catch(error => {
        logger.error(`Error getting metadata: ${error.message}`);
        res.status(500).json({
          error: `Error: ${error.message}`,
          code: ERROR_CODES.SERVER_ERROR
        });
      });
  } catch (error) {
    logger.error(`Error handling METADATA command: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// Handle METADATA command for specific files
function handleFileMetadataCommand(req, res, filePath) {
  try {
    const normalizedPath = path.normalize(filePath);
    
    if (normalizedPath.includes('..')) {
      return res.status(400).json({
        error: 'Invalid path',
        code: ERROR_CODES.INVALID_PATH
      });
    }
    
    const targetPath = path.join(FILES_DIR, normalizedPath);
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({
        error: 'File not found',
        code: ERROR_CODES.FILE_NOT_FOUND
      });
    }
    
    const metadata = getFileMetadata(targetPath);
    res.json(metadata);
  } catch (error) {
    logger.error(`Error handling file metadata command: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// Handle HEALTH command
function handleHealthCommand(req, res) {
  try {
    const healthCheck = {
      status: 'UP',
      timestamp: new Date(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      diskSpace: {
        free: 0,
        total: 0
      }
    };
    
    // Get disk space info
    exec('df -k .', (error, stdout) => {
      if (error) {
        logger.error(`Error getting disk space: ${error.message}`);
        healthCheck.diskSpace = { error: error.message };
      } else {
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          if (parts.length >= 4) {
            healthCheck.diskSpace = {
              total: parseInt(parts[1]) * 1024,
              free: parseInt(parts[3]) * 1024
            };
          }
        }
      }
      
      res.json(healthCheck);
    });
  } catch (error) {
    logger.error(`Error handling HEALTH command: ${error.message}`);
    res.status(500).json({
      error: `Error: ${error.message}`,
      code: ERROR_CODES.SERVER_ERROR
    });
  }
}

// Create some test files/directories
function createTestFiles() {
  // Check if there are any files/directories
  const entries = fs.readdirSync(FILES_DIR);
  if (entries.filter(entry => !entry.startsWith('.')).length > 0) {
    return; // Skip if there are already files
  }
  
  logger.info('Creating test files and directories...');
  
  // Create directories
  const dirs = ['documents', 'images', 'data'];
  dirs.forEach(dir => {
    fs.mkdirSync(path.join(FILES_DIR, dir), { recursive: true });
  });
  
  // Create text files
  for (let i = 1; i <= 3; i++) {
    fs.writeFileSync(
      path.join(FILES_DIR, `test_file_${i}.txt`),
      `This is test file ${i} with some sample content.\n`.repeat(10)
    );
  }
  
  // Create files in subdirectories
  for (let i = 1; i <= 2; i++) {
    fs.writeFileSync(
      path.join(FILES_DIR
