#!/usr/bin/env bash
# Assemble the single-file app from its source parts.
set -e
cd "$(dirname "$0")"
cat src/parts/p1_head.html \
    src/parts/p2_data.js \
    src/parts/p3_app.js \
    src/parts/p4_coding.js \
    src/parts/p5_games.js \
    src/parts/p6_tail.html > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
