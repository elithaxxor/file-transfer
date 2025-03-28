#!/bin/bash

# Check if rsync is installed
if ! command -v rsync &> /dev/null; then
    echo "Error: rsync is not installed. Please install rsync to use remote transfer features."
    exit 1
fi

# Function to check if a path is remote
is_remote_path() {
    if echo "$1" | grep -q ":"; then
        return 0  # Path is remote
    else
        return 1  # Path is local
    fi
}

# Function to display the menu
show_menu() {
    echo "=== File Management Menu ==="
    echo "1. Copy files/folder"
    echo "2. Move files/folder"
    echo "3. Analyze folder"
    echo "4. Exit"
    echo "============================"
    echo "Enter your choice (1-4): "
}

# Function to copy files/folder (local or remote)
copy_files() {
    read -p "Enter source path: " source
    read -p "Enter destination path: " dest
    if ! is_remote_path "$source" && ! is_remote_path "$dest"; then
        # Local to local: use cp
        cp -r "$source" "$dest" && echo "Copy successful!" || echo "Copy failed!"
    else
        # Remote involved: use rsync
        rsync -a "$source" "$dest" && echo "Copy successful!" || echo "Copy failed!"
    fi
}

# Function to move files/folder (local or remote)
move_files() {
    read -p "Enter source path: " source
    read -p "Enter destination path: " dest
    if ! is_remote_path "$source" && ! is_remote_path "$dest"; then
        # Local to local: use mv
        mv "$source" "$dest" && echo "Move successful!" || echo "Move failed!"
    else
        # Remote involved: use rsync with removal
        rsync -a --remove-source-files "$source" "$dest" && echo "Move successful!" || echo "Move failed!"
    fi
}

# Function to analyze folder contents (unchanged)
analyze_folder() {
    read -p "Enter folder path to analyze: " folder
    if [ -d "$folder" ]; then
        echo "Analyzing folder: $folder"
        echo "------------------------"
        
        # Total number of files
        file_count=$(find "$folder" -type f | wc -l)
        echo "Total number of files: $file_count"
        
        # Total size of the folder
        total_size=$(du -sh "$folder" | cut -f1)
        echo "Total size: $total_size"
        
        # Detailed list of files with size and modification date
        echo -e "\nDetailed contents:"
        echo "Size  Last Modified       Name"
        echo "---------------------------------------------"
        find "$folder" -type f -exec stat -c "%s bytes  %y  %n" {} + | sort -n
        
        echo "------------------------"
        echo "Analysis complete!"
    else
        echo "Error: '$folder' is not a valid directory!"
    fi
}

# Main loop
while true; do
    show_menu
    read choice
    case $choice in
        1)
            copy_files
            ;;
        2)
            move_files
            ;;
        3)
            analyze_folder
            ;;
        4)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid choice! Please select 1-4."
            ;;
    esac
    echo -e "\nPress Enter to continue..."
    read
done
