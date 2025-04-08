#!/bin/bash
# binary-replace.sh - A binary-safe file replacement utility
# Usage: binary-replace.sh <original_file> <search_file> <replace_file> <output_file>
#
# This script performs binary-safe search and replace operations, avoiding issues
# with special characters, line endings, and other common text processing problems.

set -e

# Check arguments
if [ "$#" -ne 4 ]; then
  echo "ERROR: Wrong number of arguments"
  echo "Usage: $(basename "$0") <original_file> <search_file> <replace_file> <output_file>"
  exit 1
fi

ORIGINAL_FILE="$1"
SEARCH_FILE="$2"
REPLACE_FILE="$3"
OUTPUT_FILE="$4"
TEMP_DIR=$(dirname "$OUTPUT_FILE")

# Ensure all input files exist
if [ ! -f "$ORIGINAL_FILE" ]; then
  echo "ERROR: Original file not found: $ORIGINAL_FILE"
  exit 1
fi

if [ ! -f "$SEARCH_FILE" ]; then
  echo "ERROR: Search pattern file not found: $SEARCH_FILE"
  exit 1
fi

if [ ! -f "$REPLACE_FILE" ]; then
  echo "ERROR: Replace content file not found: $REPLACE_FILE"
  exit 1
fi

# Convert files to hex for truly binary-safe operations
xxd -p "$ORIGINAL_FILE" > "$ORIGINAL_FILE.hex"
xxd -p "$SEARCH_FILE" > "$SEARCH_FILE.hex"

# Read hex content without newlines
FILE_HEX=$(tr -d '\n' < "$ORIGINAL_FILE.hex")
SEARCH_HEX=$(tr -d '\n' < "$SEARCH_FILE.hex")

# Normalize the search pattern for common issues
# 1. Remove trailing newline (0a) if present
SEARCH_HEX_NORMALIZED=$(echo "$SEARCH_HEX" | sed 's/0a$//') 

# First try with the original search pattern
SEARCH_HEX_LEN=${#SEARCH_HEX}
HEX_POS=$(awk -v a="$FILE_HEX" -v b="$SEARCH_HEX" 'BEGIN{print index(a,b)}')

# If not found, try with normalized pattern
if [ "$HEX_POS" = "0" ] && [ "$SEARCH_HEX" != "$SEARCH_HEX_NORMALIZED" ]; then
  echo "Trying with normalized search pattern (removed trailing newline)"
  SEARCH_HEX="$SEARCH_HEX_NORMALIZED"
  SEARCH_HEX_LEN=${#SEARCH_HEX}
  HEX_POS=$(awk -v a="$FILE_HEX" -v b="$SEARCH_HEX" 'BEGIN{print index(a,b)}')
fi

# If still not found, exit with error
if [ "$HEX_POS" = "0" ]; then
  echo "ERROR: Pattern not found in hex representation"
  exit 2
fi

# Calculate byte position (hex_pos is character position in hex dump)
BYTE_POS=$((HEX_POS / 2))
if [ $((HEX_POS % 2)) -ne 0 ]; then
  echo "WARNING: Hex position $HEX_POS is not aligned to byte boundary"
  # Adjust for alignment - since we're working with bytes
  BYTE_POS=$((BYTE_POS + 1))
fi

# Calculate byte length of search pattern
BYTE_LEN=$((SEARCH_HEX_LEN / 2))

echo "Found pattern at hex position $HEX_POS (byte offset $BYTE_POS)"
echo "Pattern length: $BYTE_LEN bytes"

# We've already handled normalization above

# Check for multiple occurrences by removing the first match and searching again
SECOND_FILE="$TEMP_DIR/second_search.hex"
FIRST_PART=$(dd if="$ORIGINAL_FILE.hex" bs=1 count=$HEX_POS 2>/dev/null)
SECOND_PART=$(dd if="$ORIGINAL_FILE.hex" bs=1 skip=$((HEX_POS + SEARCH_HEX_LEN)) 2>/dev/null)
echo "$FIRST_PART$SECOND_PART" > "$SECOND_FILE"

# Search for another occurrence
SECOND_HEX=$(tr -d '\n' < "$SECOND_FILE")
SECOND_POS=$(awk -v a="$SECOND_HEX" -v b="$SEARCH_HEX" 'BEGIN{print index(a,b)}')

if [ "$SECOND_POS" != "0" ]; then
  echo "ERROR: Multiple matches found"
  exit 3
fi

# Everything looks good, proceed with the replacement
# Extract parts using binary offsets
PREFIX_FILE="$TEMP_DIR/prefix.bin"
SUFFIX_FILE="$TEMP_DIR/suffix.bin"

# Extract the prefix (bytes before the match)
dd if="$ORIGINAL_FILE" of="$PREFIX_FILE" bs=1 count=$BYTE_POS 2>/dev/null
echo "Prefix size: $(wc -c < $PREFIX_FILE) bytes"

# Extract the suffix (bytes after the match)
dd if="$ORIGINAL_FILE" of="$SUFFIX_FILE" bs=1 skip=$((BYTE_POS + BYTE_LEN)) 2>/dev/null
echo "Suffix size: $(wc -c < $SUFFIX_FILE) bytes"

# Create the new file by concatenating the parts
cat "$PREFIX_FILE" "$REPLACE_FILE" "$SUFFIX_FILE" > "$OUTPUT_FILE"
echo "New file size: $(wc -c < $OUTPUT_FILE) bytes"

# Output sizes for verification
echo "SIZES: orig=$(wc -c < $ORIGINAL_FILE) bytes, prefix=$BYTE_POS bytes, pattern=$BYTE_LEN bytes, replace=$(wc -c < $REPLACE_FILE) bytes, suffix=$(wc -c < $SUFFIX_FILE) bytes, new=$(wc -c < $OUTPUT_FILE) bytes"

# Verify expected size
EXPECTED_SIZE=$((BYTE_POS + $(wc -c < $REPLACE_FILE) + $(wc -c < $SUFFIX_FILE)))
ACTUAL_SIZE=$(wc -c < "$OUTPUT_FILE")
echo "VERIFICATION: Expected size $EXPECTED_SIZE bytes, actual size $ACTUAL_SIZE bytes"

# Clean up temporary hex files
rm -f "$ORIGINAL_FILE.hex" "$SEARCH_FILE.hex" "$SECOND_FILE"

exit 0