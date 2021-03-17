#! /usr/bin/env bash

hyperfine -w 2 \
  -n interpret 'node bench.js interpret' \
  -n chained 'node bench.js chained' \
  -n jit 'node bench.js jit'
