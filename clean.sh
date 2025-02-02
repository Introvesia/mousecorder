#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Cleaning up build artifacts...${NC}"

# Clean build directories
directories_to_clean=(
    "dist"
    "release"
)

for dir in "${directories_to_clean[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${RED}Removing $dir${NC}"
        rm -rf "$dir"
    fi
done

# Remove any .js files that have corresponding .ts files
find . -type f -name "*.js" | while read file; do
    # Skip node_modules
    if [[ $file == *"node_modules"* ]]; then
        continue
    fi
    
    # Check if corresponding .ts file exists
    ts_file="${file%.js}.ts"
    tsx_file="${file%.js}.tsx"
    
    if [ -f "$ts_file" ] || [ -f "$tsx_file" ]; then
        echo -e "${RED}Removing $file (TypeScript version exists)${NC}"
        rm "$file"
        # Also remove source map if it exists
        if [ -f "${file}.map" ]; then
            rm "${file}.map"
        fi
    fi
done

# Remove specific files if they exist
files_to_remove=(
    "electron/main.js"
    "electron/preload.js"
    "src/main/main.js"
)

for file in "${files_to_remove[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${RED}Removing $file${NC}"
        rm "$file"
    fi
done

# Remove any leftover .js.map files
find . -type f -name "*.js.map" -delete

echo -e "${GREEN}Cleanup complete!${NC}" 