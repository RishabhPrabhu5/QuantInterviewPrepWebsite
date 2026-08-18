#!/usr/bin/env bash
# Assemble the single-file app from its source parts.
# p5a/p5b (card games, drills) must precede p5_games.js: p5 ends with the
# boot code, which has to evaluate after every other declaration.
set -e
cd "$(dirname "$0")"
cat src/parts/p1_head.html \
    src/parts/p2_data.js \
    src/parts/p3_app.js \
    src/parts/p4_coding.js \
    src/parts/p5a_cards.js \
    src/parts/p5b_drills.js \
    src/parts/p5_games.js \
    src/parts/p6_tail.html > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
